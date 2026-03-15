import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Workspace } from './entities/workspace.entity';
import { WorkspaceMember } from '../workspace-member/entities/workspace-member.entity';
import { User } from '../users/entities/user.entity';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';
import { WorkspaceRole } from 'src/common/enums/workspace-role.enum';

@Injectable()
export class WorkspaceService {
  constructor(
    @InjectRepository(Workspace)
    private workspaceRepo: Repository<Workspace>,
    @InjectRepository(WorkspaceMember)
    private memberRepo: Repository<WorkspaceMember>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
  ) {}

  /**
   * Tạo workspace mới
   * - Tự động thêm owner vào bảng workspace_member với role OWNER
   */
  // async create(dto: CreateWorkspaceDto) {
  //   const owner = await this.userRepo.findOne({
  //     where: { userId: dto.ownerId },
  //   });
  //   if (!owner) throw new BadRequestException('Owner not found');

  //   const workspace = this.workspaceRepo.create({
  //     workspaceName: dto.workspaceName,
  //     description: dto.description,
  //     type: dto.type,
  //     avatarUrl: dto.avatarUrl,
  //     color: dto.color ?? '#0d9488',
  //     isPublic: dto.isPublic ?? false,
  //     memberLimit: dto.memberLimit ?? 50,
  //     owner,
  //   });
  //   const saved = await this.workspaceRepo.save(workspace);

  //   // Auto-add owner là thành viên đầu tiên
  //   const member = this.memberRepo.create({
  //     workspace: saved,
  //     user: owner,
  //     role: WorkspaceRole.OWNER,
  //   });
  //   await this.memberRepo.save(member);

  //   return this.findOne(saved.workspaceId);
  // }

  //Hàm Tạo để test
  // src/modules/workspace/workspace.service.ts
  async create(dto: CreateWorkspaceDto) {
    const users = await this.userRepo.find({
      order: { createdAt: 'ASC' },
      take: 1,
    });
    const owner = users[0];

    if (!owner) {
      throw new BadRequestException('No user found to assign as owner');
    }

    const workspace = this.workspaceRepo.create({
      workspaceName: dto.workspaceName,
      description: dto.description,
      type: dto.type,
      avatarUrl: dto.avatarUrl,
      color: dto.color ?? '#0d9488',
      isPublic: dto.isPublic ?? false,
      memberLimit: dto.memberLimit ?? 50,
      owner,
    });

    const saved = await this.workspaceRepo.save(workspace);

    const member = this.memberRepo.create({
      workspace: saved,
      user: owner,
      role: WorkspaceRole.OWNER,
    });
    await this.memberRepo.save(member);

    return this.findOne(saved.workspaceId);
  }

  /**
   * Lấy tất cả workspace mà user tham gia
   * - Query qua bảng workspace_member → lấy workspace kèm members, boards
   */
  async findAllForUser(userId: string) {
    const memberships = await this.memberRepo.find({
      where: { user: { userId } },
      relations: [
        'workspace',
        'workspace.owner',
        'workspace.members',
        'workspace.members.user',
        'workspace.boards',
      ],
    });
    return memberships.map((m) => m.workspace);
  }

  /**
   * Lấy chi tiết workspace theo ID
   * - Kèm theo: owner, members (user), boards (columns)
   */
  async findOne(id: string) {
    const workspace = await this.workspaceRepo.findOne({
      where: { workspaceId: id },
      relations: [
        'owner',
        'members',
        'members.user',
        'boards',
        'boards.columns',
      ],
    });
    if (!workspace) throw new NotFoundException('Workspace not found');
    return workspace;
  }

  /**
   * Cập nhật workspace (partial update)
   */
  async update(id: string, dto: UpdateWorkspaceDto) {
    const workspace = await this.findOne(id);
    Object.assign(workspace, dto);
    await this.workspaceRepo.save(workspace);
    return this.findOne(id);
  }

  /**
   * Xóa workspace
   */
  async remove(id: string) {
    const workspace = await this.findOne(id);
    return this.workspaceRepo.remove(workspace);
  }
}
