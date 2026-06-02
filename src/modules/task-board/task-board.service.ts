import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TaskBoard } from './entities/task-board.entity';
import { BoardColumn } from '../board-column/entities/board-column.entity';
import { Workspace } from '../workspace/entities/workspace.entity';
import { WorkspaceMember } from '../workspace-member/entities/workspace-member.entity';
import { CreateTaskBoardDto } from './dto/create-task-board.dto';
import { UpdateTaskBoardDto } from './dto/update-task-board.dto';
import { TaskStatus } from 'src/common/enums/task-status.enum';
import { WorkspaceRole } from 'src/common/enums/workspace-role.enum';

@Injectable()
export class TaskBoardService {
  constructor(
    @InjectRepository(TaskBoard)
    private boardRepo: Repository<TaskBoard>,
    @InjectRepository(BoardColumn)
    private columnRepo: Repository<BoardColumn>,
    @InjectRepository(Workspace)
    private workspaceRepo: Repository<Workspace>,
    @InjectRepository(WorkspaceMember)
    private memberRepo: Repository<WorkspaceMember>,
  ) {}

  private async assertManager(workspaceId: string, actorId?: string) {
    if (!actorId) return;
    const member = await this.memberRepo.findOne({
      where: { workspace: { workspaceId }, user: { userId: actorId } },
    });
    if (
      member?.role !== WorkspaceRole.OWNER &&
      member?.role !== WorkspaceRole.ADMIN
    ) {
      throw new ForbiddenException('Only workspace owner/admin can manage boards');
    }
  }

  /**
   * Tạo board mới trong workspace
   * - Tự động tạo 4 columns mặc định: To Do, In Progress, Review, Done
   */
  async create(workspaceId: string, dto: CreateTaskBoardDto, actorId?: string) {
    await this.assertManager(workspaceId, actorId);
    const workspace = await this.workspaceRepo.findOne({
      where: { workspaceId },
    });
    if (!workspace) throw new NotFoundException('Workspace not found');

    const board = this.boardRepo.create({
      boardName: dto.boardName,
      description: dto.description,
      backgroundColor: dto.backgroundColor ?? '#0d9488',
      icon: dto.icon ?? 'fa-clipboard-list',
      workspace,
    });
    const saved = await this.boardRepo.save(board);

    // Tạo 4 columns mặc định
    const defaultColumns = [
      { name: 'To Do', status: TaskStatus.TODO, color: '#94a3b8', order: 0 },
      {
        name: 'In Progress',
        status: TaskStatus.IN_PROGRESS,
        color: '#3b82f6',
        order: 1,
      },
      { name: 'Review', status: TaskStatus.REVIEW, color: '#f59e0b', order: 2 },
      { name: 'Done', status: TaskStatus.DONE, color: '#10b981', order: 3 },
    ];

    for (const col of defaultColumns) {
      const column = this.columnRepo.create({ ...col, board: saved });
      await this.columnRepo.save(column);
    }

    return this.findOne(workspaceId, saved.boardId);
  }

  /**
   * Lấy tất cả boards trong workspace
   * - Kèm số lượng columns
   */
  async findAllByWorkspace(workspaceId: string) {
    return this.boardRepo.find({
      where: { workspace: { workspaceId } },
      relations: ['columns'],
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Lấy chi tiết board
   * - Kèm columns (sắp xếp theo order) và tasks trong mỗi column
   */
  async findOne(workspaceId: string, boardId: string) {
    const board = await this.boardRepo.findOne({
      where: { boardId, workspace: { workspaceId } },
      relations: [
        'columns',
        'columns.tasks',
        'columns.tasks.assignees',
        'columns.tasks.labels',
      ],
    });
    if (!board) throw new NotFoundException('Board not found');

    // Sắp xếp columns theo order
    board.columns.sort((a, b) => a.order - b.order);
    return board;
  }

  /**
   * Cập nhật board (partial update)
   */
  async update(
    workspaceId: string,
    boardId: string,
    dto: UpdateTaskBoardDto,
    actorId?: string,
  ) {
    await this.assertManager(workspaceId, actorId);
    const board = await this.findOne(workspaceId, boardId);
    Object.assign(board, dto);
    await this.boardRepo.save(board);
    return this.findOne(workspaceId, boardId);
  }

  /**
   * Xóa board
   * - Cascade xóa columns và tasks
   */
  async remove(workspaceId: string, boardId: string, actorId?: string) {
    await this.assertManager(workspaceId, actorId);
    const board = await this.findOne(workspaceId, boardId);
    return this.boardRepo.remove(board);
  }
}
