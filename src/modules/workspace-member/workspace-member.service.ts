import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkspaceMember } from './entities/workspace-member.entity';
import { Workspace } from '../workspace/entities/workspace.entity';
import { User } from '../users/entities/user.entity';
import { AddMemberDto } from './dto/add-member.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { WorkspaceRole } from 'src/common/enums/workspace-role.enum';

@Injectable()
export class WorkspaceMemberService {
  constructor(
    @InjectRepository(WorkspaceMember)
    private memberRepo: Repository<WorkspaceMember>,
    @InjectRepository(Workspace)
    private workspaceRepo: Repository<Workspace>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
  ) {}

  /**
   * Thêm thành viên vào workspace
   * - Kiểm tra workspace tồn tại, user tồn tại
   * - Kiểm tra user chưa là thành viên
   * - Kiểm tra chưa vượt quá giới hạn thành viên
   */
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
    return this.memberRepo.save(member);
  }

  /**
   * Lấy tất cả thành viên của workspace
   * - Kèm thông tin user (avatar, name, email)
   */
  async findAllByWorkspace(workspaceId: string) {
    return this.memberRepo.find({
      where: { workspace: { workspaceId } },
      relations: ['user'],
      order: { joinedAt: 'ASC' },
    });
  }

  /**
   * Cập nhật role thành viên
   * - Không cho phép đổi role của OWNER cuối cùng
   */
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

  /**
   * Xóa thành viên khỏi workspace
   * - Không cho phép xóa OWNER cuối cùng
   */
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
}
