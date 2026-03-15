import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Task } from './entities/task.entity';
import { TaskAssignee } from './entities/task-assignee.entity';
import { TaskBoard } from '../task-board/entities/task-board.entity';
import { BoardColumn } from '../board-column/entities/board-column.entity';
import { Label } from '../label/entities/label.entity';
import { User } from '../users/entities/user.entity';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto, MoveTaskDto } from './dto/update-task.dto';

@Injectable()
export class TaskService {
  constructor(
    @InjectRepository(Task)
    private taskRepo: Repository<Task>,
    @InjectRepository(TaskAssignee)
    private assigneeRepo: Repository<TaskAssignee>,
    @InjectRepository(TaskBoard)
    private boardRepo: Repository<TaskBoard>,
    @InjectRepository(BoardColumn)
    private columnRepo: Repository<BoardColumn>,
    @InjectRepository(Label)
    private labelRepo: Repository<Label>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
  ) {}

  // Quan hệ
  private readonly fullRelations = [
    'board',
    'column',
    'createdBy',
    'assignees',
    'assignees.user',
    'labels',
  ];

  private readonly detailRelations = [
    ...this.fullRelations,
    'subtasks',
    'subtasks.children',
    'subtasks.children.children',
    'subtasks.assignee',
    'subtasks.children.assignee',
    'comments',
    'comments.author',
    'attachments',
    'attachments.uploadedBy',
    'activityLogs',
    'activityLogs.user',
  ];

  async create(boardId: string, dto: CreateTaskDto) {
    const board = await this.boardRepo.findOne({ where: { boardId } });
    if (!board) throw new NotFoundException('Board not found');

    const createdBy = await this.userRepo.findOne({
      where: { userId: dto.createdById },
    });
    if (!createdBy) throw new NotFoundException('Creator user not found');

    let column: BoardColumn | null = null;
    if (dto.columnId) {
      column = await this.columnRepo.findOne({
        where: { columnId: dto.columnId },
      });
    }

    let order = 0;
    if (column) {
      const count = await this.taskRepo.count({
        where: { column: { columnId: column.columnId } },
      });
      order = count;
    }

    let labels: Label[] = [];
    if (dto.labelIds?.length) {
      labels = await this.labelRepo.find({
        where: { labelId: In(dto.labelIds) },
      });
    }

    const task = this.taskRepo.create({
      title: dto.title,
      description: dto.description,
      priority: dto.priority,
      status: dto.status,
      startDate: dto.startDate ? new Date(dto.startDate) : undefined,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      order,
      board,
      column,
      createdBy,
      labels,
    });
    const saved = await this.taskRepo.save(task);

    if (dto.assigneeIds?.length) {
      for (const userId of dto.assigneeIds) {
        const user = await this.userRepo.findOne({ where: { userId } });
        if (user) {
          const assignee = this.assigneeRepo.create({ task: saved, user });
          await this.assigneeRepo.save(assignee);
        }
      }
    }

    return this.findOne(saved.taskId);
  }

  async findByBoard(boardId: string) {
    return this.taskRepo.find({
      where: { board: { boardId } },
      relations: this.fullRelations,
      order: { order: 'ASC' },
    });
  }

  findAll() {
    return this.taskRepo.find({
      relations: this.fullRelations,
    });
  }

  async findOne(id: string) {
    const task = await this.taskRepo.findOne({
      where: { taskId: id },
      relations: this.detailRelations,
    });
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  async update(id: string, dto: UpdateTaskDto) {
    const task = await this.findOne(id);

    if (dto.labelIds) {
      task.labels = await this.labelRepo.find({
        where: { labelId: In(dto.labelIds) },
      });
    }

    if (dto.assigneeIds) {
      await this.assigneeRepo.delete({ task: { taskId: id } });
      for (const userId of dto.assigneeIds) {
        const user = await this.userRepo.findOne({ where: { userId } });
        if (user) {
          const assignee = this.assigneeRepo.create({ task, user });
          await this.assigneeRepo.save(assignee);
        }
      }
    }

    if (dto.columnId) {
      const column = await this.columnRepo.findOne({
        where: { columnId: dto.columnId },
      });
      if (column) task.column = column;
    }

    if (dto.title !== undefined) task.title = dto.title;
    if (dto.description !== undefined) task.description = dto.description;
    if (dto.priority !== undefined) task.priority = dto.priority;
    if (dto.status !== undefined) task.status = dto.status;
    if (dto.startDate !== undefined)
      task.startDate = dto.startDate ? new Date(dto.startDate) : null;
    if (dto.dueDate !== undefined)
      task.dueDate = dto.dueDate ? new Date(dto.dueDate) : null;

    await this.taskRepo.save(task);
    return this.findOne(id);
  }

  async moveTask(id: string, dto: MoveTaskDto) {
    const task = await this.findOne(id);

    const column = await this.columnRepo.findOne({
      where: { columnId: dto.columnId },
    });
    if (!column) throw new NotFoundException('Column not found');

    task.column = column;
    task.status = dto.status;
    if (dto.order !== undefined) task.order = dto.order;

    await this.taskRepo.save(task);
    return this.findOne(id);
  }

  async remove(id: string) {
    const task = await this.findOne(id);
    return this.taskRepo.remove(task);
  }
}
