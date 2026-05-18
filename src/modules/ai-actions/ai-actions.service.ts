import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { Repository } from "typeorm";
import { TaskService } from "../task/task.service";
import { NotificationService } from "../notifications/notification.service";
import { WorkspaceMember } from "../workspace-member/entities/workspace-member.entity";
import { TaskBoard } from "../task-board/entities/task-board.entity";
import { Priority } from "src/common/enums/priority.enum";
import { TaskStatus } from "src/common/enums/task-status.enum";
import type {
  AIActionExecutionResult,
  AIActionSuggestion,
} from "./ai-action.types";

@Injectable()
export class AIActionsService {
  constructor(
    private readonly taskService: TaskService,
    private readonly notificationService: NotificationService,
    @InjectRepository(WorkspaceMember)
    private readonly memberRepo: Repository<WorkspaceMember>,
    @InjectRepository(TaskBoard)
    private readonly boardRepo: Repository<TaskBoard>,
  ) {}

  async execute(
    userId: string,
    action: AIActionSuggestion,
  ): Promise<AIActionExecutionResult> {
    if (!action || !action.type) {
      return { status: "rejected", message: "Invalid action" };
    }

    switch (action.type) {
      case "create_task":
        return this.executeCreateTask(userId, action);
      case "summarize_unread":
        return this.executeSummarizeUnread(userId);
      default:
        return {
          status: "rejected",
          message: `Unsupported action type: ${action.type}`,
        };
    }
  }

  private async executeCreateTask(
    userId: string,
    action: AIActionSuggestion,
  ): Promise<AIActionExecutionResult> {
    const payload = action.payload ?? {};
    const title = this.getString(payload.title) || action.title;
    const boardId = this.getString(payload.boardId);
    const workspaceId = this.getString(payload.workspaceId);

    const requiredFields = [
      !title ? "title" : null,
      !boardId ? "boardId" : null,
      !workspaceId ? "workspaceId" : null,
    ].filter((item): item is string => !!item);

    if (requiredFields.length > 0) {
      return {
        status: "needs_input",
        message: "Missing required fields to create task",
        requiredFields,
      };
    }

    const membership = await this.memberRepo.findOne({
      where: { workspace: { workspaceId }, user: { userId } },
    });

    if (!membership) {
      return {
        status: "rejected",
        message: "You are not a member of this workspace",
      };
    }

    const board = await this.boardRepo.findOne({
      where: { boardId, workspace: { workspaceId } },
    });

    if (!board) {
      return {
        status: "rejected",
        message: "Board not found in workspace",
      };
    }

    const created = await this.taskService.create(boardId, {
      title,
      description: this.getString(payload.description),
      priority: this.normalizePriority(payload.priority),
      status: this.normalizeStatus(payload.status),
      startDate: this.getString(payload.startDate),
      dueDate: this.getString(payload.dueDate),
      columnId: this.getString(payload.columnId),
      createdById: userId,
      assigneeIds: this.getStringArray(payload.assigneeIds),
      labelIds: this.getStringArray(payload.labelIds),
    });

    return {
      status: "executed",
      message: "Task created",
      data: created,
    };
  }

  private async executeSummarizeUnread(
    userId: string,
  ): Promise<AIActionExecutionResult> {
    const digest = await this.notificationService.buildDigest(userId, {
      sinceHours: 24,
      includeRead: false,
      useAI: true,
      maxItems: 40,
    });

    return {
      status: "executed",
      message: digest.summary || "Digest ready",
      data: digest,
    };
  }

  private normalizePriority(value?: unknown): Priority {
    if (typeof value === "string") {
      const normalized = value.toUpperCase();
      if (normalized === "LOW") return Priority.LOW;
      if (normalized === "MEDIUM") return Priority.MEDIUM;
      if (normalized === "HIGH") return Priority.HIGH;
      if (normalized === "URGENT" || normalized === "CRITICAL")
        return Priority.URGENT;
    }
    return Priority.MEDIUM;
  }

  private normalizeStatus(value?: unknown): TaskStatus {
    if (typeof value === "string") {
      const normalized = value.toUpperCase();
      if (normalized === "TODO") return TaskStatus.TODO;
      if (normalized === "IN_PROGRESS") return TaskStatus.IN_PROGRESS;
      if (normalized === "REVIEW") return TaskStatus.REVIEW;
      if (normalized === "DONE") return TaskStatus.DONE;
    }
    return TaskStatus.TODO;
  }

  private getString(value?: unknown): string | undefined {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
    return undefined;
  }

  private getStringArray(value?: unknown): string[] | undefined {
    if (!Array.isArray(value)) return undefined;
    const filtered = value
      .filter((item) => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
    return filtered.length > 0 ? filtered : undefined;
  }
}
