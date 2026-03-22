import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { WorkspaceFile } from './entities/workspace-file.entity';
import { Workspace } from '../workspace/entities/workspace.entity';
import { User } from '../users/entities/user.entity';
import { CreateWorkspaceFileDto } from './dto/create-workspace-file.dto';
import { UpdateWorkspaceFileDto } from './dto/update-workspace-file.dto';

@Injectable()
export class WorkspaceFileService {
  constructor(
    @InjectRepository(WorkspaceFile)
    private fileRepo: Repository<WorkspaceFile>,
    @InjectRepository(Workspace)
    private workspaceRepo: Repository<Workspace>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
  ) {}

  async create(
    workspaceId: string,
    dto: CreateWorkspaceFileDto,
    userId: string,
  ) {
    const workspace = await this.workspaceRepo.findOne({
      where: { workspaceId },
    });
    if (!workspace) throw new NotFoundException('Workspace not found');

    const user = await this.userRepo.findOne({ where: { userId } });
    if (!user) throw new NotFoundException('User not found');

    let parent: WorkspaceFile | null = null;
    if (dto.parentId) {
      parent = await this.fileRepo.findOne({
        where: { fileId: dto.parentId },
      });
      if (!parent) throw new NotFoundException('Parent folder not found');
    }

    const file = this.fileRepo.create({
      name: dto.name,
      type: dto.type || 'file',
      mimeType: dto.mimeType,
      size: dto.size,
      url: dto.url,
      accessLevel: dto.accessLevel || 'workspace',
      workspace,
      uploadedBy: user,
      parent,
    });

    return this.fileRepo.save(file);
  }

  async createFolder(
    workspaceId: string,
    dto: CreateWorkspaceFileDto,
    userId: string,
  ) {
    const workspace = await this.workspaceRepo.findOne({
      where: { workspaceId },
    });
    if (!workspace) throw new NotFoundException('Workspace not found');

    const user = await this.userRepo.findOne({ where: { userId } });
    if (!user) throw new NotFoundException('User not found');

    let parent: WorkspaceFile | null = null;
    if (dto.parentId) {
      parent = await this.fileRepo.findOne({
        where: { fileId: dto.parentId },
      });
      if (!parent) throw new NotFoundException('Parent folder not found');
    }

    const folder = this.fileRepo.create({
      name: dto.name,
      type: 'folder',
      accessLevel: dto.accessLevel || 'workspace',
      workspace,
      uploadedBy: user,
      parent,
    });

    return this.fileRepo.save(folder);
  }

  async findByWorkspace(workspaceId: string, parentId?: string) {
    const where: any = {
      workspace: { workspaceId },
    };

    if (parentId) {
      where.parent = { fileId: parentId };
    } else {
      where.parent = IsNull();
    }

    return this.fileRepo.find({
      where,
      relations: ['uploadedBy'],
      order: { type: 'ASC', name: 'ASC' },
    });
  }

  async findOne(id: string) {
    const file = await this.fileRepo.findOne({
      where: { fileId: id },
      relations: ['uploadedBy', 'workspace', 'parent'],
    });
    if (!file) throw new NotFoundException('File not found');
    return file;
  }

  async update(id: string, dto: UpdateWorkspaceFileDto) {
    const file = await this.findOne(id);

    if (dto.name !== undefined) file.name = dto.name;
    if (dto.mimeType !== undefined) file.mimeType = dto.mimeType;
    if (dto.size !== undefined) file.size = dto.size;
    if (dto.url !== undefined) file.url = dto.url;
    if (dto.accessLevel !== undefined) file.accessLevel = dto.accessLevel;

    if (dto.parentId !== undefined) {
      if (dto.parentId) {
        const parent = await this.fileRepo.findOne({
          where: { fileId: dto.parentId },
        });
        if (!parent) throw new NotFoundException('Parent folder not found');
        file.parent = parent;
      } else {
        file.parent = null;
      }
    }

    return this.fileRepo.save(file);
  }

  async remove(id: string) {
    const file = await this.findOne(id);
    return this.fileRepo.remove(file);
  }
}
