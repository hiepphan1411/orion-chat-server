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

  // Relations dùng chung khi query task
  private readonly fullRelations = [
    'board',
    'column',
    'createdBy',
    'assignees',
    'assignees.user',
    'labels',
  ];

  /**
   * Tạo task mới trong board
   * - Gán column, createdBy, assignees, labels nếu có
   * - Tự động tính order (thêm vào cuối column)
   */
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

    // Tính order cho task mới trong column
    let order = 0;
    if (column) {
      const count = await this.taskRepo.count({
        where: { column: { columnId: column.columnId } },
      });
      order = count;
    }

    // Tìm labels nếu có
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

    // Thêm assignees nếu có
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

  /**
   * Lấy tất cả tasks trong board
   * - Kèm column, assignees, labels, createdBy
   * - Sắp xếp theo order trong mỗi column
   */
  async findByBoard(boardId: string) {
    return this.taskRepo.find({
      where: { board: { boardId } },
      relations: this.fullRelations,
      order: { order: 'ASC' },
    });
  }

  /**
   * Lấy tất cả tasks (không filter board)
   */
  findAll() {
    return this.taskRepo.find({
      relations: this.fullRelations,
    });
  }

  /**
   * Lấy chi tiết task theo ID
   */
  async findOne(id: string) {
    const task = await this.taskRepo.findOne({
      where: { taskId: id },
      relations: this.fullRelations,
    });
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  /**
   * Cập nhật task
   * - Cập nhật assignees và labels nếu có truyền vào
   */
  async update(id: string, dto: UpdateTaskDto) {
    const task = await this.findOne(id);

    // Cập nhật labels nếu có
    if (dto.labelIds) {
      task.labels = await this.labelRepo.find({
        where: { labelId: In(dto.labelIds) },
      });
    }

    // Cập nhật assignees nếu có
    if (dto.assigneeIds) {
      // Xóa assignees cũ
      await this.assigneeRepo.delete({ task: { taskId: id } });
      // Thêm assignees mới
      for (const userId of dto.assigneeIds) {
        const user = await this.userRepo.findOne({ where: { userId } });
        if (user) {
          const assignee = this.assigneeRepo.create({ task, user });
          await this.assigneeRepo.save(assignee);
        }
      }
    }

    // Cập nhật column nếu có
    if (dto.columnId) {
      const column = await this.columnRepo.findOne({
        where: { columnId: dto.columnId },
      });
      if (column) task.column = column;
    }

    // Cập nhật các field đơn giản
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

  /**
   * Di chuyển task sang column khác (kéo thả trên Kanban)
   * - Cập nhật column, status, order
   */
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

  /**
   * Xóa task
   */
  async remove(id: string) {
    const task = await this.findOne(id);
    return this.taskRepo.remove(task);
  }
}
