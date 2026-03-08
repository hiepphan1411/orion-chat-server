import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Task } from './entities/task.entity';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

@Injectable()
export class TaskService {
  constructor(
    @InjectRepository(Task)
    private taskRepository: Repository<Task>,
  ) {}

  create(dto: CreateTaskDto) {
    const task = this.taskRepository.create(dto);
    return this.taskRepository.save(task);
  }

  findAll() {
    return this.taskRepository.find({
      relations: ['board'],
    });
  }

  async findOne(id: string) {
    const task = await this.taskRepository.findOne({
      where: { taskId: id },
    });

    if (!task) throw new NotFoundException('Task not found');

    return task;
  }

  async update(id: string, dto: UpdateTaskDto) {
    await this.taskRepository.update(id, dto);
    return this.findOne(id);
  }

  async remove(id: string) {
    const task = await this.findOne(id);
    return this.taskRepository.remove(task);
  }
}
