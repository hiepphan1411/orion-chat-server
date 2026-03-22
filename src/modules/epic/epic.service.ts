import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Epic } from './entities/epic.entity';
import { Workspace } from '../workspace/entities/workspace.entity';
import { User } from '../users/entities/user.entity';
import { TaskBoard } from '../task-board/entities/task-board.entity';
import { CreateEpicDto } from './dto/create-epic.dto';
import { UpdateEpicDto } from './dto/update-epic.dto';

@Injectable()
export class EpicService {
  constructor(
    @InjectRepository(Epic)
    private epicRepo: Repository<Epic>,
    @InjectRepository(Workspace)
    private workspaceRepo: Repository<Workspace>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectRepository(TaskBoard)
    private taskBoardRepo: Repository<TaskBoard>,
  ) {}

  /**
   * Tạo epic mới trong workspace
   */
  async create(workspaceId: string, dto: CreateEpicDto) {
    const workspace = await this.workspaceRepo.findOne({
      where: { workspaceId },
    });
    if (!workspace) throw new NotFoundException('Workspace not found');

    const owner = await this.userRepo.findOne({
      where: { userId: dto.ownerId },
    });
    if (!owner) throw new NotFoundException('Owner not found');

    let board: TaskBoard | null = null;
    if (dto.boardId) {
      board = await this.taskBoardRepo.findOne({
        where: { boardId: dto.boardId },
      });
      if (!board) throw new NotFoundException('TaskBoard not found');
    }

    const epic = this.epicRepo.create({
      title: dto.title,
      description: dto.description,
      status: dto.status,
      color: dto.color,
      progress: dto.progress,
      startDate: dto.startDate,
      endDate: dto.endDate,
      workspace,
      owner,
      board,
    });
    return this.epicRepo.save(epic);
  }

  /**
   * Lấy tất cả epics trong workspace
   */
  async findByWorkspace(workspaceId: string) {
    return this.epicRepo.find({
      where: { workspace: { workspaceId } },
      relations: ['owner', 'board'],
    });
  }

  /**
   * Cập nhật epic
   */
  async update(id: string, dto: UpdateEpicDto) {
    const epic = await this.epicRepo.findOne({
      where: { epicId: id },
    });
    if (!epic) throw new NotFoundException('Epic not found');

    if (dto.ownerId) {
      const owner = await this.userRepo.findOne({
        where: { userId: dto.ownerId },
      });
      if (!owner) throw new NotFoundException('Owner not found');
      epic.owner = owner;
    }

    if (dto.boardId !== undefined) {
      if (dto.boardId) {
        const board = await this.taskBoardRepo.findOne({
          where: { boardId: dto.boardId },
        });
        if (!board) throw new NotFoundException('TaskBoard not found');
        epic.board = board;
      } else {
        epic.board = null;
      }
    }

    const { ownerId, boardId, ...rest } = dto;
    Object.assign(epic, rest);
    return this.epicRepo.save(epic);
  }

  /**
   * Xóa epic
   */
  async remove(id: string) {
    const epic = await this.epicRepo.findOne({
      where: { epicId: id },
    });
    if (!epic) throw new NotFoundException('Epic not found');
    return this.epicRepo.remove(epic);
  }
}
