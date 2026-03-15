import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { SubTask } from './entities/sub-task.entity';
import { Task } from '../task/entities/task.entity';
import { User } from '../users/entities/user.entity';
import { CreateSubTaskDto } from './dto/create-sub-task.dto';
import { UpdateSubTaskDto } from './dto/update-sub-task.dto';

@Injectable()
export class SubTaskService {
  constructor(
    @InjectRepository(SubTask)
    private subTaskRepo: Repository<SubTask>,
    @InjectRepository(Task)
    private taskRepo: Repository<Task>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
  ) {}

  /**
   * Tạo subtask mới
   */
  async create(taskId: string, dto: CreateSubTaskDto) {
    const task = await this.taskRepo.findOne({ where: { taskId } });
    if (!task) throw new NotFoundException('Task not found');

    let parent: SubTask | null = null;
    if (dto.parentSubTaskId) {
      parent = await this.subTaskRepo.findOne({
        where: { subTaskId: dto.parentSubTaskId },
      });
      if (!parent) throw new NotFoundException('Parent subtask not found');
    }

    let assignee: User | null = null;
    if (dto.assigneeId) {
      assignee = await this.userRepo.findOne({
        where: { userId: dto.assigneeId },
      });
      if (!assignee) throw new NotFoundException('Assignee user not found');
    }

    const count = await this.subTaskRepo.count({
      where: parent
        ? { parent: { subTaskId: parent.subTaskId } }
        : { task: { taskId }, parent: IsNull() },
    });

    const subTask = this.subTaskRepo.create({
      title: dto.title,
      description: dto.description,
      status: dto.status,
      deadline: dto.deadline ? new Date(dto.deadline) : null,
      order: count,
      task,
      parent,
      assignee,
    });

    const saved = await this.subTaskRepo.save(subTask);

    return this.subTaskRepo.findOne({
      where: { subTaskId: saved.subTaskId },
      relations: [
        'children',
        'children.children',
        'children.assignee',
        'assignee',
      ],
    });
  }

  async findByTask(taskId: string) {
    return this.subTaskRepo.find({
      where: { task: { taskId }, parent: IsNull() },
      relations: [
        'children',
        'children.children',
        'children.assignee',
        'assignee',
      ],
      order: { order: 'ASC' },
    });
  }

  async update(id: string, dto: UpdateSubTaskDto) {
    const subTask = await this.subTaskRepo.findOne({
      where: { subTaskId: id },
      relations: ['assignee'],
    });
    if (!subTask) throw new NotFoundException('SubTask not found');

    if (dto.title !== undefined) subTask.title = dto.title;
    if (dto.description !== undefined) subTask.description = dto.description;
    if (dto.status !== undefined) subTask.status = dto.status;
    if (dto.deadline !== undefined)
      subTask.deadline = dto.deadline ? new Date(dto.deadline) : null;

    if (dto.assigneeId !== undefined) {
      if (dto.assigneeId) {
        const assignee = await this.userRepo.findOne({
          where: { userId: dto.assigneeId },
        });
        if (!assignee) throw new NotFoundException('Assignee user not found');
        subTask.assignee = assignee;
      } else {
        subTask.assignee = null;
      }
    }

    await this.subTaskRepo.save(subTask);
    return this.subTaskRepo.findOne({
      where: { subTaskId: id },
      relations: [
        'children',
        'children.children',
        'children.assignee',
        'assignee',
      ],
    });
  }

  async remove(id: string) {
    const subTask = await this.subTaskRepo.findOne({
      where: { subTaskId: id },
    });
    if (!subTask) throw new NotFoundException('SubTask not found');
    return this.subTaskRepo.remove(subTask);
  }
}
