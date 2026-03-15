import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ActivityLog } from './entities/activity-log.entity';
import { Task } from '../task/entities/task.entity';
import { User } from '../users/entities/user.entity';
import { CreateActivityLogDto } from './dto/create-activity-log.dto';

@Injectable()
export class ActivityLogService {
  constructor(
    @InjectRepository(ActivityLog)
    private activityLogRepo: Repository<ActivityLog>,
    @InjectRepository(Task)
    private taskRepo: Repository<Task>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
  ) {}

  async create(taskId: string, dto: CreateActivityLogDto) {
    const task = await this.taskRepo.findOne({ where: { taskId } });
    if (!task) throw new NotFoundException('Task not found');

    const user = await this.userRepo.findOne({
      where: { userId: dto.userId },
    });
    if (!user) throw new NotFoundException('User not found');

    const activityLog = this.activityLogRepo.create({
      action: dto.action,
      description: dto.description,
      metadata: dto.metadata,
      task,
      user,
    });

    return this.activityLogRepo.save(activityLog);
  }

  async findByTask(taskId: string) {
    return this.activityLogRepo.find({
      where: { task: { taskId } },
      order: { timestamp: 'DESC' },
    });
  }
}
