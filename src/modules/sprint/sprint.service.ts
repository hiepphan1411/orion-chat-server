import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Sprint } from './entities/sprint.entity';
import { Workspace } from '../workspace/entities/workspace.entity';
import { Task } from '../task/entities/task.entity';
import { CreateSprintDto } from './dto/create-sprint.dto';
import { UpdateSprintDto } from './dto/update-sprint.dto';

@Injectable()
export class SprintService {
  constructor(
    @InjectRepository(Sprint)
    private sprintRepo: Repository<Sprint>,
    @InjectRepository(Workspace)
    private workspaceRepo: Repository<Workspace>,
    @InjectRepository(Task)
    private taskRepo: Repository<Task>,
  ) {}

  /**
   * Tao sprint moi trong workspace
   */
  async create(workspaceId: string, dto: CreateSprintDto) {
    const workspace = await this.workspaceRepo.findOne({
      where: { workspaceId },
    });
    if (!workspace) throw new NotFoundException('Workspace not found');

    const sprint = this.sprintRepo.create({
      name: dto.name,
      goal: dto.goal,
      status: dto.status,
      startDate: dto.startDate,
      endDate: dto.endDate,
      workspace,
    });
    return this.sprintRepo.save(sprint);
  }

  /**
   * Lay tat ca sprints trong workspace
   */
  async findByWorkspace(workspaceId: string) {
    return this.sprintRepo.find({
      where: { workspace: { workspaceId } },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Lay sprint theo id
   */
  async findOne(sprintId: string) {
    const sprint = await this.sprintRepo.findOne({
      where: { sprintId },
    });
    if (!sprint) throw new NotFoundException('Sprint not found');
    return sprint;
  }

  /**
   * Cap nhat sprint
   */
  async update(sprintId: string, dto: UpdateSprintDto) {
    const sprint = await this.sprintRepo.findOne({
      where: { sprintId },
    });
    if (!sprint) throw new NotFoundException('Sprint not found');

    Object.assign(sprint, dto);
    return this.sprintRepo.save(sprint);
  }

  /**
   * Xoa sprint
   */
  async remove(sprintId: string) {
    const sprint = await this.sprintRepo.findOne({
      where: { sprintId },
    });
    if (!sprint) throw new NotFoundException('Sprint not found');
    return this.sprintRepo.remove(sprint);
  }

  /**
   * Lay tat ca tasks trong sprint
   */
  async getSprintTasks(sprintId: string) {
    const sprint = await this.sprintRepo.findOne({
      where: { sprintId },
    });
    if (!sprint) throw new NotFoundException('Sprint not found');

    return this.taskRepo.find({
      where: { sprint: { sprintId } },
    });
  }
}
