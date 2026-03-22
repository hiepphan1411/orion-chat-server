import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Milestone } from './entities/milestone.entity';
import { Workspace } from '../workspace/entities/workspace.entity';
import { CreateMilestoneDto } from './dto/create-milestone.dto';
import { UpdateMilestoneDto } from './dto/update-milestone.dto';

@Injectable()
export class MilestoneService {
  constructor(
    @InjectRepository(Milestone)
    private milestoneRepo: Repository<Milestone>,
    @InjectRepository(Workspace)
    private workspaceRepo: Repository<Workspace>,
  ) {}

  /**
   * Tạo milestone mới trong workspace
   */
  async create(workspaceId: string, dto: CreateMilestoneDto) {
    const workspace = await this.workspaceRepo.findOne({
      where: { workspaceId },
    });
    if (!workspace) throw new NotFoundException('Workspace not found');

    const milestone = this.milestoneRepo.create({
      title: dto.title,
      date: dto.date,
      status: dto.status,
      workspace,
    });
    return this.milestoneRepo.save(milestone);
  }

  /**
   * Lấy tất cả milestones trong workspace
   */
  async findByWorkspace(workspaceId: string) {
    return this.milestoneRepo.find({
      where: { workspace: { workspaceId } },
    });
  }

  /**
   * Cập nhật milestone
   */
  async update(id: string, dto: UpdateMilestoneDto) {
    const milestone = await this.milestoneRepo.findOne({
      where: { milestoneId: id },
    });
    if (!milestone) throw new NotFoundException('Milestone not found');

    Object.assign(milestone, dto);
    return this.milestoneRepo.save(milestone);
  }

  /**
   * Xóa milestone
   */
  async remove(id: string) {
    const milestone = await this.milestoneRepo.findOne({
      where: { milestoneId: id },
    });
    if (!milestone) throw new NotFoundException('Milestone not found');
    return this.milestoneRepo.remove(milestone);
  }
}
