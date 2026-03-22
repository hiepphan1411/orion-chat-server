import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Goal } from './entities/goal.entity';
import { KeyResult } from './entities/key-result.entity';
import { Workspace } from '../workspace/entities/workspace.entity';
import { User } from '../users/entities/user.entity';
import { CreateGoalDto } from './dto/create-goal.dto';
import { UpdateGoalDto } from './dto/update-goal.dto';
import { CreateKeyResultDto } from './dto/create-key-result.dto';
import { UpdateKeyResultDto } from './dto/update-key-result.dto';

@Injectable()
export class GoalService {
  constructor(
    @InjectRepository(Goal)
    private goalRepo: Repository<Goal>,
    @InjectRepository(KeyResult)
    private keyResultRepo: Repository<KeyResult>,
    @InjectRepository(Workspace)
    private workspaceRepo: Repository<Workspace>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
  ) {}

  /**
   * Create a new goal in a workspace
   */
  async create(workspaceId: string, dto: CreateGoalDto) {
    const workspace = await this.workspaceRepo.findOne({
      where: { workspaceId },
    });
    if (!workspace) throw new NotFoundException('Workspace not found');

    const owner = await this.userRepo.findOne({
      where: { userId: dto.ownerId },
    });
    if (!owner) throw new NotFoundException('Owner not found');

    const goal = this.goalRepo.create({
      title: dto.title,
      description: dto.description,
      status: dto.status,
      progress: dto.progress,
      startDate: dto.startDate,
      endDate: dto.endDate,
      workspace,
      owner,
    });
    return this.goalRepo.save(goal);
  }

  /**
   * Get all goals in a workspace
   */
  async findByWorkspace(workspaceId: string) {
    return this.goalRepo.find({
      where: { workspace: { workspaceId } },
      relations: ['keyResults', 'owner'],
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Update a goal
   */
  async update(goalId: string, dto: UpdateGoalDto) {
    const goal = await this.goalRepo.findOne({
      where: { goalId },
    });
    if (!goal) throw new NotFoundException('Goal not found');

    if (dto.ownerId) {
      const owner = await this.userRepo.findOne({
        where: { userId: dto.ownerId },
      });
      if (!owner) throw new NotFoundException('Owner not found');
      goal.owner = owner;
    }

    const { ownerId, ...rest } = dto;
    Object.assign(goal, rest);
    return this.goalRepo.save(goal);
  }

  /**
   * Delete a goal
   */
  async remove(goalId: string) {
    const goal = await this.goalRepo.findOne({
      where: { goalId },
    });
    if (!goal) throw new NotFoundException('Goal not found');
    return this.goalRepo.remove(goal);
  }

  /**
   * Create a key result for a goal
   */
  async createKeyResult(goalId: string, dto: CreateKeyResultDto) {
    const goal = await this.goalRepo.findOne({
      where: { goalId },
    });
    if (!goal) throw new NotFoundException('Goal not found');

    const keyResult = this.keyResultRepo.create({
      title: dto.title,
      target: dto.target,
      current: dto.current,
      unit: dto.unit,
      goal,
    });
    return this.keyResultRepo.save(keyResult);
  }

  /**
   * Update a key result and recalculate goal progress
   */
  async updateKeyResult(krId: string, dto: UpdateKeyResultDto) {
    const keyResult = await this.keyResultRepo.findOne({
      where: { keyResultId: krId },
      relations: ['goal'],
    });
    if (!keyResult) throw new NotFoundException('Key Result not found');

    Object.assign(keyResult, dto);
    const saved = await this.keyResultRepo.save(keyResult);

    // Recalculate goal progress based on key results
    await this.recalculateGoalProgress(keyResult.goal.goalId);

    return saved;
  }

  /**
   * Delete a key result
   */
  async removeKeyResult(krId: string) {
    const keyResult = await this.keyResultRepo.findOne({
      where: { keyResultId: krId },
      relations: ['goal'],
    });
    if (!keyResult) throw new NotFoundException('Key Result not found');

    const goalId = keyResult.goal.goalId;
    const removed = await this.keyResultRepo.remove(keyResult);

    // Recalculate goal progress after removal
    await this.recalculateGoalProgress(goalId);

    return removed;
  }

  /**
   * Recalculate goal progress as average of key result percentages
   */
  private async recalculateGoalProgress(goalId: string) {
    const goal = await this.goalRepo.findOne({
      where: { goalId },
      relations: ['keyResults'],
    });
    if (!goal) return;

    if (goal.keyResults.length === 0) {
      goal.progress = 0;
    } else {
      const totalPercent = goal.keyResults.reduce((sum, kr) => {
        const percent = kr.target > 0 ? (kr.current / kr.target) * 100 : 0;
        return sum + percent;
      }, 0);
      goal.progress = Math.round(totalPercent / goal.keyResults.length);
    }

    await this.goalRepo.save(goal);
  }
}
