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
import { NotificationService } from '../notifications/notification.service';
import { Workspace } from '../workspace/entities/workspace.entity';

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
    @InjectRepository(Workspace)
    private workspaceRepo: Repository<Workspace>,
    private notificationService: NotificationService,
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
    const board = await this.boardRepo.findOne({
      where: { boardId },
      relations: ['workspace'],
    });
    if (!board) throw new NotFoundException('Board not found');

    const createdBy = await this.userRepo.findOne({
      where: { userId: dto.createdById },
    });
    if (!createdBy) throw new NotFoundException('Creator user not found');

    let column: BoardColumn | null = null;
    if (dto.columnId) {
      column = await this.columnRepo.findOne({
        where: { columnId: dto.columnId, board: { boardId } },
      });
      if (!column) throw new NotFoundException('Column not found in this board');
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
      description: dto.description as string,
      priority: dto.priority,
      status: dto.status,
      startDate: dto.startDate ? new Date(dto.startDate) : (null as any),
      dueDate: dto.dueDate ? new Date(dto.dueDate) : (null as any),
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
          const assignee = this.assigneeRepo.create({ task: saved as any, user });
          await this.assigneeRepo.save(assignee);

          // Send notification to the assigned user
          const taskTitle = (saved as any)?.title || 'Task';
          const taskId = (saved as any)?.taskId || '';
          const workspaceId = board.workspace?.workspaceId || 'unknown';
          await this.notificationService.createAndEmit({
            userId,
            type: 'system',
            title: 'Task Assignment',
            body: `You were assigned to task: "${taskTitle}"`,
            link: `/work-hub/${workspaceId}/boards/${boardId}?task=${taskId}`,
            metadata: {
              taskId,
              taskTitle,
              boardId,
              workspaceId,
            },
          });
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
    
    // Ensure arrays are initialized
    if (!task.assignees) task.assignees = [];
    if (!task.labels) task.labels = [];
    if (!task.subtasks) task.subtasks = [];
    if (!task.comments) task.comments = [];
    if (!task.attachments) task.attachments = [];
    if (!task.activityLogs) task.activityLogs = [];
    
    return task;
  }

  async update(id: string, dto: UpdateTaskDto) {
    const task = await this.findOne(id);
    const board = await this.boardRepo.findOne({
      where: { boardId: task.board.boardId },
      relations: ['workspace'],
    });

    if (dto.labelIds) {
      task.labels = await this.labelRepo.find({
        where: { labelId: In(dto.labelIds) },
      });
    }

    if (dto.assigneeIds) {
      // Get current assignee IDs
      const currentAssignees = await this.assigneeRepo.find({
        where: { task: { taskId: id } },
        relations: ['user'],
      });
      const currentUserIds = currentAssignees.map((a) => a.user.userId);

      // Find new assignees
      const newUserIds = dto.assigneeIds.filter((uid) => !currentUserIds.includes(uid));

      // Delete old assignees
      await this.assigneeRepo.delete({ task: { taskId: id } });

      // Add new assignees and send notifications
      for (const userId of dto.assigneeIds) {
        const user = await this.userRepo.findOne({ where: { userId } });
        if (user) {
          const assignee = this.assigneeRepo.create({ task, user });
          await this.assigneeRepo.save(assignee);

          // Send notification only to newly assigned users
          if (newUserIds.includes(userId)) {
            const workspaceId = board?.workspace?.workspaceId || 'unknown';
            await this.notificationService.createAndEmit({
              userId,
              type: 'system',
              title: 'Task Assignment',
              body: `You were assigned to task: "${task.title}"`,
              link: `/work-hub/${workspaceId}/boards/${task.board.boardId}?task=${task.taskId}`,
              metadata: {
                taskId: task.taskId,
                taskTitle: task.title,
                boardId: task.board.boardId,
                workspaceId,
              },
            });
          }
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
