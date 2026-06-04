import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { WorkspaceMember } from './entities/workspace-member.entity';
import {
  WorkspaceJoinRequest,
  WorkspaceJoinRequestStatus,
} from './entities/workspace-join-request.entity';
import { Workspace } from '../workspace/entities/workspace.entity';
import { User } from '../users/entities/user.entity';
import { AddMemberDto } from './dto/add-member.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { WorkspaceRole } from 'src/common/enums/workspace-role.enum';
import { NotificationService } from '../notifications/notification.service';
import * as crypto from 'crypto';

@Injectable()
export class WorkspaceMemberService {
  constructor(
    @InjectRepository(WorkspaceMember)
    private memberRepo: Repository<WorkspaceMember>,
    @InjectRepository(WorkspaceJoinRequest)
    private joinRequestRepo: Repository<WorkspaceJoinRequest>,
    @InjectRepository(Workspace)
    private workspaceRepo: Repository<Workspace>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    private notificationService: NotificationService,
  ) {}

  private canManage(role?: WorkspaceRole) {
    return role === WorkspaceRole.OWNER || role === WorkspaceRole.ADMIN;
  }

  private async getMembership(workspaceId: string, userId: string) {
    return this.memberRepo.findOne({
      where: { workspace: { workspaceId }, user: { userId } },
      relations: ['user'],
    });
  }

  private async assertManager(workspaceId: string, actorId: string) {
    const actor = await this.getMembership(workspaceId, actorId);
    if (!this.canManage(actor?.role)) {
      throw new ForbiddenException('Only workspace owner/admin can do this');
    }
    return actor!;
  }

  private async assertOwner(workspaceId: string, actorId: string) {
    const actor = await this.getMembership(workspaceId, actorId);
    if (actor?.role !== WorkspaceRole.OWNER) {
      throw new ForbiddenException('Only workspace owner can do this');
    }
    return actor;
  }

  async addMember(workspaceId: string, dto: AddMemberDto, actorId?: string) {
    if (actorId) await this.assertManager(workspaceId, actorId);

    const workspace = await this.workspaceRepo.findOne({
      where: { workspaceId },
    });
    if (!workspace) throw new NotFoundException('Workspace not found');

    const user = await this.userRepo.findOne({
      where: { userId: dto.userId },
    });
    if (!user) throw new NotFoundException('User not found');

    const existing = await this.memberRepo.findOne({
      where: { workspace: { workspaceId }, user: { userId: dto.userId } },
    });
    if (existing) throw new BadRequestException('User is already a member');

    const count = await this.memberRepo.count({
      where: { workspace: { workspaceId } },
    });
    if (count >= workspace.memberLimit) {
      throw new BadRequestException('Workspace member limit reached');
    }

    const member = this.memberRepo.create({
      workspace,
      user,
      role: dto.role,
    });
    const result = await this.memberRepo.save(member);

    await this.notificationService.createAndEmit({
      userId: dto.userId,
      type: 'group_invite',
      title: 'Workspace Invitation',
      body: `You were invited to workspace "${workspace.workspaceName}"`,
      link: `/work-hub/${workspaceId}`,
      metadata: {
        workspaceId,
        workspaceName: workspace.workspaceName,
      },
    });

    return result;
  }

  async findAllByWorkspace(workspaceId: string) {
    return this.memberRepo.find({
      where: { workspace: { workspaceId } },
      relations: ['user'],
      order: { joinedAt: 'ASC' },
    });
  }

  async updateRole(
    workspaceId: string,
    userId: string,
    dto: UpdateMemberRoleDto,
    actorId?: string,
  ) {
    if (actorId) {
      if (dto.role === WorkspaceRole.OWNER) {
        await this.transferOwner(workspaceId, userId, actorId);
        return this.getMembership(workspaceId, userId);
      }
      await this.assertManager(workspaceId, actorId);
    }

    const member = await this.memberRepo.findOne({
      where: { workspace: { workspaceId }, user: { userId } },
      relations: ['user'],
    });
    if (!member) throw new NotFoundException('Member not found');

    if (
      member.role === WorkspaceRole.OWNER &&
      dto.role !== WorkspaceRole.OWNER
    ) {
      const ownerCount = await this.memberRepo.count({
        where: { workspace: { workspaceId }, role: WorkspaceRole.OWNER },
      });
      if (ownerCount <= 1) {
        throw new BadRequestException('Cannot change role of the last owner');
      }
    }

    member.role = dto.role;
    return this.memberRepo.save(member);
  }

  async removeMember(workspaceId: string, userId: string, actorId?: string) {
    if (actorId) await this.assertManager(workspaceId, actorId);

    const member = await this.memberRepo.findOne({
      where: { workspace: { workspaceId }, user: { userId } },
    });
    if (!member) throw new NotFoundException('Member not found');

    if (member.role === WorkspaceRole.OWNER) {
      const ownerCount = await this.memberRepo.count({
        where: { workspace: { workspaceId }, role: WorkspaceRole.OWNER },
      });
      if (ownerCount <= 1) {
        throw new BadRequestException('Cannot remove the last owner');
      }
    }

    return this.memberRepo.remove(member);
  }

  async findUserByPhone(phoneNumber: string) {
    return this.userRepo.findOne({
      where: { phoneNumber },
    });
  }

  async findUsersByName(fullName: string) {
    return this.userRepo.find({
      where: { fullName: Like(`%${fullName}%`) },
    });
  }

  async joinByInviteLink(workspaceId: string, userId: string, token: string) {
    const payload = this.verifyInviteToken(token);
    if (payload.workspaceId !== workspaceId) {
      throw new BadRequestException('Invite link does not match workspace');
    }

    const workspace = await this.workspaceRepo.findOne({
      where: { workspaceId },
    });
    if (!workspace) throw new NotFoundException('Workspace not found');

    const user = await this.userRepo.findOne({
      where: { userId },
    });
    if (!user) throw new NotFoundException('User not found');

    const existing = await this.memberRepo.findOne({
      where: { workspace: { workspaceId }, user: { userId } },
    });
    if (existing) throw new BadRequestException('User is already a member');

    const pending = await this.joinRequestRepo.findOne({
      where: {
        workspace: { workspaceId },
        user: { userId },
        status: WorkspaceJoinRequestStatus.PENDING,
      },
    });
    if (pending) {
      throw new ConflictException('A join request is already pending approval');
    }

    const joinRequest = this.joinRequestRepo.create({
      workspace,
      user,
      requestedRole: payload.role,
      status: WorkspaceJoinRequestStatus.PENDING,
    });
    const saved = await this.joinRequestRepo.save(joinRequest);

    const managers = await this.memberRepo.find({
      where: { workspace: { workspaceId } },
      relations: ['user'],
    });
    await Promise.all(
      managers
        .filter((member) => this.canManage(member.role))
        .map((member) =>
          this.notificationService.createAndEmit({
            userId: member.user.userId,
            type: 'system',
            title: 'Workspace join request',
            body: `${user.fullName} requested to join "${workspace.workspaceName}"`,
            link: `/work-hub/${workspaceId}/members`,
            metadata: { workspaceId, requestId: saved.requestId },
          }),
        ),
    );

    return {
      status: 'PENDING_APPROVAL',
      requestId: saved.requestId,
      workspaceId,
      workspaceName: workspace.workspaceName,
    };
  }

  /**
   * Invite user by phone - tìm user rồi add
   */
  async inviteByPhone(
    workspaceId: string,
    phoneNumber: string,
    role: WorkspaceRole = WorkspaceRole.MEMBER,
    actorId?: string,
  ) {
    const user = await this.findUserByPhone(phoneNumber);
    if (!user) throw new NotFoundException(`User with phone ${phoneNumber} not found`);

    return this.addMember(workspaceId, { userId: user.userId, role }, actorId);
  }

  /**
   * Invite user by name - search and return candidates
   */
  async searchUsersByName(workspaceId: string, fullName: string) {
    const workspace = await this.workspaceRepo.findOne({
      where: { workspaceId },
    });
    if (!workspace) throw new NotFoundException('Workspace not found');

    const users = await this.findUsersByName(fullName);
    
    // Filter out users already in workspace
    const existingIds = (await this.memberRepo.find({
      where: { workspace: { workspaceId } },
      relations: ['user'],
    })).map((m) => m.user.userId);

    return users.filter((u) => !existingIds.includes(u.userId));
  }

  /**
   * Invite by name - thêm user vào workspace
   */
  async inviteByName(
    workspaceId: string,
    userId: string,
    role: WorkspaceRole = WorkspaceRole.MEMBER,
    actorId?: string,
  ) {
    return this.addMember(workspaceId, { userId, role }, actorId);
  }

  /**
   * Generate invite link cho workspace (call from controller)
   */
  async generateInviteLink(
    workspaceId: string,
    role: WorkspaceRole = WorkspaceRole.MEMBER,
    actorId?: string,
  ) {
    if (actorId) await this.assertManager(workspaceId, actorId);

    const workspace = await this.workspaceRepo.findOne({
      where: { workspaceId },
    });
    if (!workspace) throw new NotFoundException('Workspace not found');

    // Generate token
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    const token = this.signInviteToken(workspaceId, role, expiresAt);

    const baseUrl =
      process.env.WEB_BASE_URL || process.env.APP_BASE_URL || 'http://localhost:5173';
    const inviteUrl = `${baseUrl.replace(/\/+$/, '')}/work-hub/join?token=${encodeURIComponent(token)}&workspaceId=${encodeURIComponent(workspaceId)}`;
    const qrData = inviteUrl;

    return {
      inviteUrl,
      qrData,
      token,
      workspaceId,
      workspaceName: workspace.workspaceName,
      role,
      expiresAt,
    };
  }

  async findPendingJoinRequests(workspaceId: string, actorId: string) {
    await this.assertManager(workspaceId, actorId);
    return this.joinRequestRepo.find({
      where: {
        workspace: { workspaceId },
        status: WorkspaceJoinRequestStatus.PENDING,
      },
      relations: ['user'],
      order: { requestedAt: 'ASC' },
    });
  }

  async approveJoinRequest(
    workspaceId: string,
    requestId: string,
    actorId: string,
  ) {
    await this.assertManager(workspaceId, actorId);
    const joinRequest = await this.joinRequestRepo.findOne({
      where: { requestId, workspace: { workspaceId } },
      relations: ['workspace', 'user'],
    });
    if (!joinRequest) throw new NotFoundException('Join request not found');
    if (joinRequest.status !== WorkspaceJoinRequestStatus.PENDING) {
      throw new BadRequestException('Join request is not pending');
    }

    const member = await this.addMember(
      workspaceId,
      {
        userId: joinRequest.user.userId,
        role: joinRequest.requestedRole,
      },
      actorId,
    );

    const reviewer = await this.userRepo.findOne({ where: { userId: actorId } });
    joinRequest.status = WorkspaceJoinRequestStatus.APPROVED;
    joinRequest.reviewedAt = new Date();
    joinRequest.reviewedBy = reviewer ?? null;
    await this.joinRequestRepo.save(joinRequest);

    await this.notificationService.createAndEmit({
      userId: joinRequest.user.userId,
      type: 'system',
      title: 'Workspace request approved',
      body: `You can now access "${joinRequest.workspace.workspaceName}"`,
      link: `/work-hub/${workspaceId}`,
      metadata: { workspaceId, requestId },
    });

    return member;
  }

  async rejectJoinRequest(
    workspaceId: string,
    requestId: string,
    actorId: string,
  ) {
    await this.assertManager(workspaceId, actorId);
    const joinRequest = await this.joinRequestRepo.findOne({
      where: { requestId, workspace: { workspaceId } },
      relations: ['workspace', 'user'],
    });
    if (!joinRequest) throw new NotFoundException('Join request not found');
    if (joinRequest.status !== WorkspaceJoinRequestStatus.PENDING) {
      throw new BadRequestException('Join request is not pending');
    }

    const reviewer = await this.userRepo.findOne({ where: { userId: actorId } });
    joinRequest.status = WorkspaceJoinRequestStatus.REJECTED;
    joinRequest.reviewedAt = new Date();
    joinRequest.reviewedBy = reviewer ?? null;
    await this.joinRequestRepo.save(joinRequest);

    await this.notificationService.createAndEmit({
      userId: joinRequest.user.userId,
      type: 'system',
      title: 'Workspace request rejected',
      body: `Your request to join "${joinRequest.workspace.workspaceName}" was rejected`,
      link: `/work-hub`,
      metadata: { workspaceId, requestId },
    });

    return joinRequest;
  }

  async transferOwner(workspaceId: string, targetUserId: string, actorId: string) {
    const owner = await this.assertOwner(workspaceId, actorId);
    if (targetUserId === actorId) return owner;

    const target = await this.getMembership(workspaceId, targetUserId);
    if (!target) throw new NotFoundException('Target member not found');

    owner.role = WorkspaceRole.ADMIN;
    target.role = WorkspaceRole.OWNER;
    await this.memberRepo.save([owner, target]);

    await this.workspaceRepo.update(
      { workspaceId },
      { owner: target.user } as Partial<Workspace>,
    );

    await this.notificationService.createAndEmit({
      userId: targetUserId,
      type: 'system',
      title: 'Workspace ownership transferred',
      body: 'You are now the owner of this workspace',
      link: `/work-hub/${workspaceId}`,
      metadata: { workspaceId },
    });

    return target;
  }

  private signInviteToken(
    workspaceId: string,
    role: WorkspaceRole,
    expiresAt: Date,
  ) {
    const payload = Buffer.from(
      JSON.stringify({
        workspaceId,
        role,
        exp: expiresAt.getTime(),
      }),
    ).toString('base64url');
    const signature = crypto
      .createHmac('sha256', this.getInviteSecret())
      .update(payload)
      .digest('base64url');
    return `${payload}.${signature}`;
  }

  private verifyInviteToken(token: string): {
    workspaceId: string;
    role: WorkspaceRole;
    exp: number;
  } {
    const [payload, signature] = token.split('.');
    if (!payload || !signature) throw new BadRequestException('Invalid invite link');
    const expected = crypto
      .createHmac('sha256', this.getInviteSecret())
      .update(payload)
      .digest('base64url');
    if (signature !== expected) throw new BadRequestException('Invalid invite link');

    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!parsed.workspaceId || !parsed.exp) {
      throw new BadRequestException('Invalid invite link');
    }
    if (Number(parsed.exp) < Date.now()) {
      throw new BadRequestException('Invite link has expired');
    }
    return {
      workspaceId: String(parsed.workspaceId),
      role:
        parsed.role && Object.values(WorkspaceRole).includes(parsed.role)
          ? parsed.role
          : WorkspaceRole.MEMBER,
      exp: Number(parsed.exp),
    };
  }

  private getInviteSecret() {
    return process.env.JWT_SECRET || 'your-secret-key';
  }
}
