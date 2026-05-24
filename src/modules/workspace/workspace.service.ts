import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Workspace } from './entities/workspace.entity';
import { WorkspaceMember } from '../workspace-member/entities/workspace-member.entity';
import { User } from '../users/entities/user.entity';
import { Task } from '../task/entities/task.entity';
import { TaskAssignee } from '../task/entities/task-assignee.entity';
import { TaskBoard } from '../task-board/entities/task-board.entity';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';
import { WorkspaceRole } from 'src/common/enums/workspace-role.enum';
import * as crypto from 'crypto';

@Injectable()
export class WorkspaceService {
  constructor(
    @InjectRepository(Workspace)
    private workspaceRepo: Repository<Workspace>,
    @InjectRepository(WorkspaceMember)
    private memberRepo: Repository<WorkspaceMember>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectRepository(Task)
    private taskRepo: Repository<Task>,
    @InjectRepository(TaskAssignee)
    private taskAssigneeRepo: Repository<TaskAssignee>,
    @InjectRepository(TaskBoard)
    private taskBoardRepo: Repository<TaskBoard>,
  ) {}

  /**
   * Tạo workspace mới
   */
  async create(dto: CreateWorkspaceDto) {
    const owner = await this.userRepo.findOne({
      where: { userId: dto.ownerId },
    });
    if (!owner) throw new BadRequestException('Owner not found');

    const workspace = this.workspaceRepo.create({
      workspaceName: dto.workspaceName,
      description: dto.description,
      type: dto.type,
      avatarUrl: dto.avatarUrl,
      color: dto.color ?? '#0d9488',
      isPublic: dto.isPublic ?? false,
      memberLimit: dto.memberLimit ?? 50,
      owner,
    });
    const saved = await this.workspaceRepo.save(workspace);

    const member = this.memberRepo.create({
      workspace: saved,
      user: owner,
      role: WorkspaceRole.OWNER,
    });
    await this.memberRepo.save(member);

    return this.findOne(saved.workspaceId);
  }

  /**
   * Lấy tất cả workspace mà user tham gia
   */
  async findAllForUser(userId: string) {
    const memberships = await this.memberRepo.find({
      where: { user: { userId } },
      relations: [
        'workspace',
        'workspace.owner',
        'workspace.members',
        'workspace.members.user',
        'workspace.boards',
      ],
    });
    return memberships.map((m) => m.workspace);
  }

  /**
   * Lấy chi tiết workspace theo ID
   */
  async findOne(id: string) {
    const workspace = await this.workspaceRepo.findOne({
      where: { workspaceId: id },
      relations: [
        'owner',
        'members',
        'members.user',
        'boards',
        'boards.columns',
      ],
    });
    if (!workspace) throw new NotFoundException('Workspace not found');
    return workspace;
  }

  /**
   * Cập nhật workspace (partial update)
   */
  async update(id: string, dto: UpdateWorkspaceDto) {
    const workspace = await this.findOne(id);
    Object.assign(workspace, dto);
    await this.workspaceRepo.save(workspace);
    return this.findOne(id);
  }

  /**
   * Remove workspace
   */
  async remove(id: string, actorId?: string) {
    if (actorId) {
      const actor = await this.memberRepo.findOne({
        where: { workspace: { workspaceId: id }, user: { userId: actorId } },
      });
      if (actor?.role !== WorkspaceRole.OWNER) {
        throw new ForbiddenException('Only workspace owner can disband workspace');
      }
    }
    const workspace = await this.findOne(id);
    return this.workspaceRepo.remove(workspace);
  }

  async transferOwner(workspaceId: string, targetUserId: string, actorId: string) {
    const actor = await this.memberRepo.findOne({
      where: {
        workspace: { workspaceId },
        user: { userId: actorId },
      },
      relations: ['user'],
    });
    if (actor?.role !== WorkspaceRole.OWNER) {
      throw new ForbiddenException('Only workspace owner can transfer ownership');
    }

    const target = await this.memberRepo.findOne({
      where: {
        workspace: { workspaceId },
        user: { userId: targetUserId },
      },
      relations: ['user'],
    });
    if (!target) throw new NotFoundException('Target member not found');

    actor.role = WorkspaceRole.ADMIN;
    target.role = WorkspaceRole.OWNER;
    await this.memberRepo.save([actor, target]);

    const workspace = await this.findOne(workspaceId);
    workspace.owner = target.user;
    await this.workspaceRepo.save(workspace);

    return this.findOne(workspaceId);
  }

  /**
   * Generate invite link cho workspace
   */
  async generateInviteLink(workspaceId: string) {
    const workspace = await this.findOne(workspaceId);

    // Generate token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const baseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';
    const inviteUrl = `${baseUrl}/workspace/join?token=${token}&workspaceId=${workspaceId}`;
    const qrData = inviteUrl;

    return {
      inviteUrl,
      qrData,
      token,
      workspaceId,
      expiresAt,
    };
  }

  /**
   * Aggregate workload cho tất cả members trong workspace
   */
  async getWorkload(workspaceId: string) {
    const members = await this.memberRepo.find({
      where: { workspace: { workspaceId } },
      relations: ['user'],
    });

    const boards = await this.taskBoardRepo.find({
      where: { workspace: { workspaceId } },
    });
    const boardIds = boards.map((b) => b.boardId);

    if (boardIds.length === 0) {
      return members.map((m) => ({
        user: m.user,
        totalTasks: 0,
        todoTasks: 0,
        inProgressTasks: 0,
        reviewTasks: 0,
        doneTasks: 0,
        overdueTasks: 0,
        lowPriority: 0,
        mediumPriority: 0,
        highPriority: 0,
        urgentPriority: 0,
      }));
    }

    const result: Array<{
      user: (typeof members)[0]['user'];
      totalTasks: number;
      todoTasks: number;
      inProgressTasks: number;
      reviewTasks: number;
      doneTasks: number;
      overdueTasks: number;
      lowPriority: number;
      mediumPriority: number;
      highPriority: number;
      urgentPriority: number;
    }> = [];
    for (const member of members) {
      const assignees = await this.taskAssigneeRepo
        .createQueryBuilder('ta')
        .innerJoinAndSelect('ta.task', 'task')
        .where('ta.user.userId = :userId', { userId: member.user.userId })
        .andWhere('task.board.boardId IN (:...boardIds)', { boardIds })
        .getMany();

      const tasks = assignees.map((a) => a.task);
      const now = new Date();

      result.push({
        user: member.user,
        totalTasks: tasks.length,
        todoTasks: tasks.filter((t) => t.status === 'TODO').length,
        inProgressTasks: tasks.filter((t) => t.status === 'IN_PROGRESS').length,
        reviewTasks: tasks.filter((t) => t.status === 'REVIEW').length,
        doneTasks: tasks.filter((t) => t.status === 'DONE').length,
        overdueTasks: tasks.filter(
          (t) => t.dueDate && new Date(t.dueDate) < now && t.status !== 'DONE',
        ).length,
        lowPriority: tasks.filter((t) => t.priority === 'LOW').length,
        mediumPriority: tasks.filter((t) => t.priority === 'MEDIUM').length,
        highPriority: tasks.filter((t) => t.priority === 'HIGH').length,
        urgentPriority: tasks.filter((t) => t.priority === 'URGENT').length,
      });
    }

    return result;
  }

  /**
   * Get dashboard stats cho workspace (phòng) - format cho dashboard UI
   * Trả về summary stats, boardStats, recentActivities, trendLast7Days
   */
  async getDashboardStats(workspaceId: string) {
    const workspace = await this.findOne(workspaceId);
    const boards = await this.taskBoardRepo.find({
      where: { workspace: { workspaceId } },
    });
    const boardIds = boards.map((b) => b.boardId);

    // Get all tasks
    const allTasks = await this.taskRepo
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.assignees', 'assignees')
      .leftJoinAndSelect('assignees.user', 'assigneeUser')
      .leftJoinAndSelect('t.board', 'board')
      .leftJoinAndSelect('t.createdBy', 'createdBy')
      .where(boardIds.length > 0 ? 't.board.boardId IN (:...boardIds)' : '1=0', { boardIds })
      .orderBy('t.createdAt', 'DESC')
      .getMany();

    const now = new Date();

    // Calculate summary stats
    const totalTasks = allTasks.length;
    const completedTasks = allTasks.filter((t) => t.status === 'DONE').length;
    const inProgressTasks = allTasks.filter((t) => t.status === 'IN_PROGRESS').length;
    const reviewTasks = allTasks.filter((t) => t.status === 'REVIEW').length;
    const todoTasks = allTasks.filter((t) => t.status === 'TODO').length;
    const overdueTasks = allTasks.filter(
      (t) => t.dueDate && new Date(t.dueDate) < now && t.status !== 'DONE',
    ).length;

    const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    // Board stats
    const boardStats = boards.map((board) => {
      const boardTasks = allTasks.filter((t) => t.board?.boardId === board.boardId);
      return {
        boardId: board.boardId,
        boardName: board.boardName,
        totalTasks: boardTasks.length,
        completedTasks: boardTasks.filter((t) => t.status === 'DONE').length,
        inProgressTasks: boardTasks.filter((t) => t.status === 'IN_PROGRESS').length,
        overdueTasks: boardTasks.filter(
          (t) => t.dueDate && new Date(t.dueDate) < now && t.status !== 'DONE',
        ).length,
      };
    });

    // Recent activities (5 tasks gần nhất)
    const recentActivities = allTasks.slice(0, 5).map((task) => ({
      activityId: task.taskId,
      action: 'task_' + task.status.toLowerCase(),
      description: `Task "${task.title}" - ${task.status}`,
      timestamp: task.updatedAt?.toISOString() || task.createdAt.toISOString(),
      task: {
        taskId: task.taskId,
        title: task.title,
      },
      user: task.createdBy,
    }));

    // Trend last 7 days
    const trendLast7Days = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);
      
      const dayTasks = allTasks.filter(
        (t) => new Date(t.completedAt || t.updatedAt).getTime() >= date.getTime() &&
               new Date(t.completedAt || t.updatedAt).getTime() < nextDate.getTime()
      );
      
      const completed = dayTasks.filter((t) => t.status === 'DONE').length;
      
      (trendLast7Days as Array<{date: string; completed: number}>).push({
        date: date.toISOString().split('T')[0],
        completed,
      });
    }

    return {
      summary: {
        totalTasks,
        completedTasks,
        inProgressTasks,
        reviewTasks,
        todoTasks,
        overdueTasks,
        completionRate,
        totalBoards: boards.length,
        totalMembers: workspace.members?.length ?? 0,
      },
      boardStats,
      recentActivities,
      trendLast7Days,
    };
  }

  /**
   * Aggregate reports cho workspace
   */
  async getReports(workspaceId: string) {
    const boards = await this.taskBoardRepo.find({
      where: { workspace: { workspaceId } },
    });
    const boardIds = boards.map((b) => b.boardId);

    if (boardIds.length === 0) {
      return {
        period: {
          totalTasks: 0,
          completedTasks: 0,
          newTasks: 0,
          completionRate: 0,
        },
        boards: [],
        members: [],
        overdue: [],
      };
    }

    const allTasks = await this.taskRepo
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.assignees', 'assignees')
      .leftJoinAndSelect('assignees.user', 'assigneeUser')
      .where('t.board.boardId IN (:...boardIds)', { boardIds })
      .getMany();

    const totalTasks = allTasks.length;
    const completedTasks = allTasks.filter((t) => t.status === 'DONE').length;
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const newTasks = allTasks.filter(
      (t) => new Date(t.createdAt) >= thirtyDaysAgo,
    ).length;

    const boardsReport = boards.map((board) => {
      const boardTasks = allTasks.filter(
        (t) => t.board?.boardId === board.boardId,
      );
      return {
        boardId: board.boardId,
        boardName: board.boardName,
        totalTasks: boardTasks.length,
        completedTasks: boardTasks.filter((t) => t.status === 'DONE').length,
        inProgressTasks: boardTasks.filter((t) => t.status === 'IN_PROGRESS')
          .length,
      };
    });

    const memberMap = new Map<string, { user: any; tasks: Task[] }>();
    for (const task of allTasks) {
      for (const assignee of task.assignees ?? []) {
        const uid = assignee.user?.userId;
        if (!uid) continue;
        if (!memberMap.has(uid)) {
          memberMap.set(uid, { user: assignee.user, tasks: [] });
        }
        memberMap.get(uid)!.tasks.push(task);
      }
    }

    const membersReport = Array.from(memberMap.values()).map(
      ({ user, tasks }) => {
        const done = tasks.filter((t) => t.status === 'DONE');
        const avgDays =
          done.length > 0
            ? done.reduce((sum, t) => {
                const created = new Date(t.createdAt).getTime();
                const completed = t.completedAt
                  ? new Date(t.completedAt).getTime()
                  : now.getTime();
                return sum + (completed - created) / (1000 * 60 * 60 * 24);
              }, 0) / done.length
            : 0;

        return {
          user,
          totalTasks: tasks.length,
          completedTasks: done.length,
          avgCompletionDays: Math.round(avgDays * 10) / 10,
        };
      },
    );

    const overdueTasks = allTasks
      .filter(
        (t) => t.dueDate && new Date(t.dueDate) < now && t.status !== 'DONE',
      )
      .map((t) => ({
        taskId: t.taskId,
        title: t.title,
        dueDate: t.dueDate,
        assignees: (t.assignees ?? []).map((a) => a.user),
        daysOverdue: Math.ceil(
          (now.getTime() - new Date(t.dueDate!).getTime()) /
            (1000 * 60 * 60 * 24),
        ),
      }));

    return {
      period: {
        totalTasks,
        completedTasks,
        newTasks,
        completionRate:
          totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
      },
      boards: boardsReport,
      members: membersReport,
      overdue: overdueTasks,
    };
  }
}
