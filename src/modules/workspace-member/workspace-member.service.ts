import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { WorkspaceMember } from './entities/workspace-member.entity';
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
    @InjectRepository(Workspace)
    private workspaceRepo: Repository<Workspace>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    private notificationService: NotificationService,
  ) {}

  async addMember(workspaceId: string, dto: AddMemberDto) {
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
      link: `/workspace/${workspaceId}`,
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
  ) {
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

  async removeMember(workspaceId: string, userId: string) {
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

  async joinByInviteLink(workspaceId: string, userId: string, role: WorkspaceRole = WorkspaceRole.MEMBER) {
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

    const count = await this.memberRepo.count({
      where: { workspace: { workspaceId } },
    });
    if (count >= workspace.memberLimit) {
      throw new BadRequestException('Workspace member limit reached');
    }

    const member = this.memberRepo.create({
      workspace,
      user,
      role,
    });
    return this.memberRepo.save(member);
  }

  /**
   * Invite user by phone - tìm user rồi add
   */
  async inviteByPhone(workspaceId: string, phoneNumber: string, role: WorkspaceRole = WorkspaceRole.MEMBER) {
    const user = await this.findUserByPhone(phoneNumber);
    if (!user) throw new NotFoundException(`User with phone ${phoneNumber} not found`);

    return this.addMember(workspaceId, { userId: user.userId, role });
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
  async inviteByName(workspaceId: string, userId: string, role: WorkspaceRole = WorkspaceRole.MEMBER) {
    return this.addMember(workspaceId, { userId, role });
  }

  /**
   * Generate invite link cho workspace (call from controller)
   */
  async generateInviteLink(workspaceId: string, role: WorkspaceRole = WorkspaceRole.MEMBER) {
    const workspace = await this.workspaceRepo.findOne({
      where: { workspaceId },
    });
    if (!workspace) throw new NotFoundException('Workspace not found');

    // Generate token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const baseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';
    const inviteUrl = `${baseUrl}/workspace/join?token=${token}&workspaceId=${workspaceId}`;
    const qrData = inviteUrl;

    return {
      inviteUrl,
      qrData,
      token,
      workspaceId,
      role,
      expiresAt,
    };
  }
}
