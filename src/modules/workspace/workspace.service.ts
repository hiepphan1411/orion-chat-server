import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Workspace } from './entities/workspace.entity';
import { WorkspaceMember } from '../workspace-member/entities/workspace-member.entity';
import { User } from '../users/entities/user.entity';
import { Task } from '../task/entities/task.entity';
import { TaskAssignee } from '../task/entities/task-assignee.entity';
import { TaskBoard } from '../task-board/entities/task-board.entity';
import { Sprint } from '../sprint/entities/sprint.entity';
import { ActivityLog } from '../activity-log/entities/activity-log.entity';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';
import { WorkspaceRole } from 'src/common/enums/workspace-role.enum';
import { TaskStatus } from 'src/common/enums/task-status.enum';
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
    @InjectRepository(Sprint)
    private sprintRepo: Repository<Sprint>,
    @InjectRepository(ActivityLog)
    private activityLogRepo: Repository<ActivityLog>,
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
  async remove(id: string) {
    const workspace = await this.findOne(id);
    return this.workspaceRepo.remove(workspace);
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

  /**
   * Aggregate AI Insights cho workspace
   */
  async getInsights(workspaceId: string) {
    const boards = await this.taskBoardRepo.find({
      where: { workspace: { workspaceId } },
    });
    const boardIds = boards.map((b) => b.boardId);

    if (boardIds.length === 0) {
      return {
        progressPercentage: 0,
        totalTasks: 0,
        completedTasks: 0,
        overdueTasks: 0,
        unclaimedTasks: 0,
        burndownData: [],
        velocityData: [],
        riskAlerts: [],
        memberPerformance: [],
        aiSuggestions: [],
        dailyDigest: [],
      };
    }

    const tasks = await this.taskRepo
      .createQueryBuilder('task')
      .leftJoinAndSelect('task.board', 'board')
      .leftJoin('board.workspace', 'workspace')
      .leftJoinAndSelect('task.assignees', 'assignees')
      .leftJoinAndSelect('assignees.user', 'assigneeUser')
      .leftJoinAndSelect('task.labels', 'labels')
      .leftJoinAndSelect('task.sprint', 'sprint')
      .where('workspace.workspaceId = :workspaceId', { workspaceId })
      .orderBy('task.updatedAt', 'DESC')
      .getMany();

    const now = new Date();
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter((t) => t.status === TaskStatus.DONE)
      .length;
    const overdueTasks = tasks.filter(
      (t) => t.dueDate && new Date(t.dueDate) < now && t.status !== TaskStatus.DONE,
    ).length;
    const unclaimedTasks = tasks.filter(
      (t) => !t.assignees || t.assignees.length === 0,
    ).length;
    const progressPercentage =
      totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    const burndownData = this.buildBurndownData(tasks);
    const velocityData = await this.buildVelocityData(workspaceId, tasks);
    const memberPerformance = await this.buildMemberPerformance(
      workspaceId,
      tasks,
    );
    const riskAlerts = this.buildRiskAlerts(
      tasks,
      memberPerformance,
      progressPercentage,
      overdueTasks,
    );
    const aiSuggestions = this.buildSuggestions(
      unclaimedTasks,
      overdueTasks,
      memberPerformance,
    );
    const dailyDigest = await this.buildDailyDigest(workspaceId);

    return {
      progressPercentage,
      totalTasks,
      completedTasks,
      overdueTasks,
      unclaimedTasks,
      burndownData,
      velocityData,
      riskAlerts,
      memberPerformance,
      aiSuggestions,
      dailyDigest,
    };
  }

  private buildBurndownData(tasks: Task[]) {
    const activeRange = this.resolveBurndownRange(tasks);
    if (!activeRange) return [];

    const { startDate, endDate } = activeRange;
    const days = this.buildDateSeries(startDate, endDate);
    if (days.length === 0) return [];

    const startTotal = tasks.filter((task) => {
      const createdAt = new Date(task.createdAt);
      const completedAt = task.completedAt ? new Date(task.completedAt) : null;
      return (
        createdAt <= startDate && (!completedAt || completedAt >= startDate)
      );
    }).length;

    const baseTotal = startTotal || tasks.length;

    return days.map((day, index) => {
      const endOfDay = new Date(day);
      endOfDay.setHours(23, 59, 59, 999);

      const remaining = tasks.filter((task) => {
        const createdAt = new Date(task.createdAt);
        const completedAt = task.completedAt ? new Date(task.completedAt) : null;
        return (
          createdAt <= endOfDay && (!completedAt || completedAt > endOfDay)
        );
      }).length;

      const ideal =
        baseTotal - Math.round((baseTotal * index) / (days.length - 1 || 1));

      return {
        date: day.toISOString().split('T')[0],
        ideal: Math.max(0, ideal),
        actual: remaining,
      };
    });
  }

  private resolveBurndownRange(tasks: Task[]) {
    if (tasks.length === 0) return null;

    const start = new Date();
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);

    const end = new Date();
    end.setHours(23, 59, 59, 999);

    return { startDate: start, endDate: end };
  }

  private buildDateSeries(startDate: Date, endDate: Date) {
    const dates: Date[] = [];
    const cursor = new Date(startDate);
    while (cursor <= endDate) {
      dates.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return dates;
  }

  private async buildVelocityData(workspaceId: string, tasks: Task[]) {
    const sprints = await this.sprintRepo.find({
      where: { workspace: { workspaceId } },
      order: { startDate: 'DESC', createdAt: 'DESC' },
      take: 4,
    });

    if (sprints.length === 0) return [];

    return sprints
      .slice()
      .reverse()
      .map((sprint) => {
        const sprintTasks = tasks.filter(
          (task) => task.sprint?.sprintId === sprint.sprintId,
        );
        const completed = sprintTasks.filter(
          (task) => task.status === TaskStatus.DONE,
        ).length;
        return {
          sprint: sprint.name || sprint.sprintId.slice(0, 6),
          planned: sprintTasks.length,
          completed,
        };
      });
  }

  private async buildMemberPerformance(
    workspaceId: string,
    tasks: Task[],
  ) {
    const now = new Date();
    const members = await this.memberRepo.find({
      where: { workspace: { workspaceId } },
      relations: ['user'],
    });

    const tasksByUser = new Map<string, Task[]>();
    for (const task of tasks) {
      for (const assignee of task.assignees ?? []) {
        const userId = assignee.user?.userId;
        if (!userId) continue;
        if (!tasksByUser.has(userId)) tasksByUser.set(userId, []);
        tasksByUser.get(userId)!.push(task);
      }
    }

    return members.map((member) => {
      const memberTasks = tasksByUser.get(member.user.userId) ?? [];
      const completed = memberTasks.filter(
        (task) => task.status === TaskStatus.DONE,
      );
      const inProgress = memberTasks.filter(
        (task) =>
          task.status === TaskStatus.IN_PROGRESS ||
          task.status === TaskStatus.REVIEW,
      );

      const avgCompletionDays = completed.length
        ? completed.reduce((sum, task) => {
            const created = new Date(task.createdAt).getTime();
            const completedAt = task.completedAt
              ? new Date(task.completedAt).getTime()
              : now.getTime();
            return sum + (completedAt - created) / (1000 * 60 * 60 * 24);
          }, 0) / completed.length
        : 0;

      const onTimeTasks = completed.filter((task) =>
        task.dueDate
          ? new Date(task.completedAt || now) <= new Date(task.dueDate)
          : true,
      );

      const onTimeRate = completed.length
        ? Math.round((onTimeTasks.length / completed.length) * 100)
        : 0;

      return {
        user: this.mapUser(member.user),
        tasksCompleted: completed.length,
        tasksInProgress: inProgress.length,
        avgCompletionDays: Math.round(avgCompletionDays * 10) / 10,
        onTimeRate,
      };
    });
  }

  private buildRiskAlerts(
    tasks: Task[],
    memberPerformance: Array<{
      user: { id: string };
      tasksInProgress: number;
    }>,
    completionRate: number,
    overdueCount: number,
  ) {
    const now = new Date();
    const alerts: Array<{
      id: string;
      type: 'deadline' | 'stale' | 'overloaded' | 'low_completion';
      severity: 'warning' | 'critical';
      message: string;
      taskId?: string;
      userId?: string;
    }> = [];

    if (overdueCount > 0) {
      alerts.push({
        id: `risk-deadline-${Date.now()}`,
        type: 'deadline',
        severity: overdueCount > 5 ? 'critical' : 'warning',
        message: `${overdueCount} tasks are overdue. Review deadlines and blockers.`,
      });
    }

    const staleTasks = tasks.filter((task) => {
      if (task.status === TaskStatus.DONE) return false;
      const updated = new Date(task.updatedAt).getTime();
      return now.getTime() - updated > 7 * 24 * 60 * 60 * 1000;
    });

    if (staleTasks.length > 0) {
      alerts.push({
        id: `risk-stale-${Date.now()}`,
        type: 'stale',
        severity: 'warning',
        message: `${staleTasks.length} tasks have no updates in 7+ days.`,
      });
    }

    const overloaded = memberPerformance.find((m) => m.tasksInProgress >= 6);
    if (overloaded) {
      alerts.push({
        id: `risk-overloaded-${Date.now()}`,
        type: 'overloaded',
        severity: 'warning',
        message: 'Some members are overloaded. Consider reassigning tasks.',
        userId: overloaded.user.id,
      });
    }

    if (completionRate < 50 && tasks.length >= 5) {
      alerts.push({
        id: `risk-low-completion-${Date.now()}`,
        type: 'low_completion',
        severity: 'warning',
        message: 'Completion rate is below 50%. Review scope and priorities.',
      });
    }

    return alerts;
  }

  private buildSuggestions(
    unclaimedTasks: number,
    overdueTasks: number,
    memberPerformance: Array<{ tasksInProgress: number }>,
  ) {
    const suggestions: Array<{
      id: string;
      type: 'reassign' | 'deadline' | 'priority' | 'split';
      title: string;
      description: string;
      actionLabel: string;
    }> = [];

    if (unclaimedTasks > 0) {
      suggestions.push({
        id: `suggest-assign-${Date.now()}`,
        type: 'reassign',
        title: 'Assign unclaimed tasks',
        description: `There are ${unclaimedTasks} tasks without an assignee.`,
        actionLabel: 'Assign now',
      });
    }

    if (overdueTasks > 0) {
      suggestions.push({
        id: `suggest-deadline-${Date.now()}`,
        type: 'deadline',
        title: 'Review overdue tasks',
        description: 'Check blockers and adjust deadlines for overdue tasks.',
        actionLabel: 'Review deadlines',
      });
    }

    const overloaded = memberPerformance.some((m) => m.tasksInProgress >= 6);
    if (overloaded) {
      suggestions.push({
        id: `suggest-rebalance-${Date.now()}`,
        type: 'reassign',
        title: 'Rebalance workload',
        description: 'Some members have high in-progress load.',
        actionLabel: 'Reassign tasks',
      });
    }

    if (suggestions.length === 0) {
      suggestions.push({
        id: `suggest-split-${Date.now()}`,
        type: 'split',
        title: 'Split large tasks',
        description: 'Consider splitting complex tasks to improve flow.',
        actionLabel: 'Review tasks',
      });
    }

    return suggestions.slice(0, 4);
  }

  private async buildDailyDigest(workspaceId: string) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const logs = await this.activityLogRepo
      .createQueryBuilder('al')
      .innerJoin('al.task', 'task')
      .innerJoin('task.board', 'board')
      .innerJoin('board.workspace', 'workspace')
      .leftJoinAndSelect('al.user', 'user')
      .where('workspace.workspaceId = :workspaceId', { workspaceId })
      .andWhere('al.timestamp >= :since', { since })
      .orderBy('al.timestamp', 'DESC')
      .take(8)
      .getMany();

    return logs.map((log) => {
      const action = log.action || '';
      const type = action.includes('completed')
        ? 'completed'
        : action.includes('created')
          ? 'created'
          : action.includes('assigned')
            ? 'assigned'
            : 'overdue';

      return {
        id: log.activityId,
        type,
        message: log.description,
        timestamp: log.timestamp.toISOString(),
      };
    });
  }

  private mapUser(user: User) {
    return {
      id: user.userId,
      name: user.fullName,
      email: user.email ?? '',
      phone: user.phoneNumber ?? undefined,
      avatar: user.avatarUrl ?? '/avatar-user.png',
      status: user.isOnline ? 'online' : 'offline',
    };
  }
}
