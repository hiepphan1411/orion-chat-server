import { ForbiddenException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { Repository } from "typeorm";
import { AIRagService } from "./ai-rag.service";
import { Task } from "../task/entities/task.entity";
import { Document } from "../document/entities/document.entity";
import { PersonalNote } from "../notes/entities/note.entity";
import { CalendarEvent, CalendarEventCategory } from "../calendar-event/entities/calendar-event.entity";
import { WorkspaceMember } from "../workspace-member/entities/workspace-member.entity";

@Injectable()
export class AIRagIngestService {
  constructor(
    private readonly aiRagService: AIRagService,
    @InjectRepository(Task)
    private readonly taskRepo: Repository<Task>,
    @InjectRepository(Document)
    private readonly documentRepo: Repository<Document>,
    @InjectRepository(PersonalNote)
    private readonly noteRepo: Repository<PersonalNote>,
    @InjectRepository(CalendarEvent)
    private readonly calendarEventRepo: Repository<CalendarEvent>,
    @InjectRepository(WorkspaceMember)
    private readonly memberRepo: Repository<WorkspaceMember>,
  ) {}

  async ingestWorkspace(
    userId: string,
    workspaceId: string,
    options?: {
      sources?: Array<"tasks" | "documents" | "meetings" | "notes">;
      since?: string;
      limit?: number;
    },
  ) {
    await this.assertWorkspaceMember(userId, workspaceId);

    const sources = new Set(
      options?.sources ?? ["tasks", "documents", "meetings", "notes"],
    );
    const limit = options?.limit ?? 120;
    const since = options?.since ? new Date(options.since) : null;

    const result: Record<string, { ingested: number; skipped: number }> = {};
    let totalIngested = 0;

    if (sources.has("tasks")) {
      const { ingested, skipped } = await this.ingestTasks(
        userId,
        workspaceId,
        since,
        limit,
      );
      result.tasks = { ingested, skipped };
      totalIngested += ingested;
    }

    if (sources.has("documents")) {
      const { ingested, skipped } = await this.ingestDocuments(
        userId,
        workspaceId,
        since,
        limit,
      );
      result.documents = { ingested, skipped };
      totalIngested += ingested;
    }

    if (sources.has("meetings")) {
      const { ingested, skipped } = await this.ingestMeetings(
        userId,
        since,
        limit,
      );
      result.meetings = { ingested, skipped };
      totalIngested += ingested;
    }

    if (sources.has("notes")) {
      const { ingested, skipped } = await this.ingestNotes(
        userId,
        since,
        limit,
      );
      result.notes = { ingested, skipped };
      totalIngested += ingested;
    }

    return {
      workspaceId,
      totalIngested,
      sources: result,
    };
  }

  private async assertWorkspaceMember(userId: string, workspaceId: string) {
    const membership = await this.memberRepo.findOne({
      where: { workspace: { workspaceId }, user: { userId } },
    });

    if (!membership) {
      throw new ForbiddenException("You are not a member of this workspace");
    }
  }

  private async ingestTasks(
    userId: string,
    workspaceId: string,
    since: Date | null,
    limit: number,
  ) {
    const qb = this.taskRepo
      .createQueryBuilder("task")
      .leftJoinAndSelect("task.board", "board")
      .leftJoinAndSelect("task.column", "column")
      .leftJoinAndSelect("task.assignees", "assignees")
      .leftJoinAndSelect("assignees.user", "assigneeUser")
      .leftJoinAndSelect("task.labels", "labels")
      .leftJoin("board.workspace", "workspace")
      .where("workspace.workspaceId = :workspaceId", { workspaceId })
      .orderBy("task.updatedAt", "DESC")
      .take(limit);

    if (since) {
      qb.andWhere("task.updatedAt >= :since", { since });
    }

    const tasks = await qb.getMany();

    let ingested = 0;
    let skipped = 0;

    for (const task of tasks) {
      const title = `Task: ${task.title}`;
      const content = this.buildTaskContent(task);
      if (!content) {
        skipped += 1;
        continue;
      }

      await this.aiRagService.ingestDocument(userId, title, content, [
        "task",
        `workspace:${workspaceId}`,
      ], {
        documentId: `workspace:${workspaceId}:task:${task.taskId}`,
      });
      ingested += 1;
    }

    return { ingested, skipped };
  }

  private async ingestDocuments(
    userId: string,
    workspaceId: string,
    since: Date | null,
    limit: number,
  ) {
    const qb = this.documentRepo
      .createQueryBuilder("doc")
      .leftJoin("doc.workspace", "workspace")
      .where("workspace.workspaceId = :workspaceId", { workspaceId })
      .orderBy("doc.updatedAt", "DESC")
      .take(limit);

    if (since) {
      qb.andWhere("doc.updatedAt >= :since", { since });
    }

    const docs = await qb.getMany();

    let ingested = 0;
    let skipped = 0;

    for (const doc of docs) {
      const title = `Document: ${doc.title}`;
      const content = this.trimText(doc.content, 4000);
      if (!content) {
        skipped += 1;
        continue;
      }

      await this.aiRagService.ingestDocument(userId, title, content, [
        "document",
        `workspace:${workspaceId}`,
      ], {
        documentId: `workspace:${workspaceId}:document:${doc.documentId}`,
      });
      ingested += 1;
    }

    return { ingested, skipped };
  }

  private async ingestMeetings(
    userId: string,
    since: Date | null,
    limit: number,
  ) {
    const qb = this.calendarEventRepo
      .createQueryBuilder("event")
      .leftJoin("event.owner", "owner")
      .where("owner.userId = :userId", { userId })
      .andWhere("event.category = :category", {
        category: CalendarEventCategory.MEETING,
      })
      .orderBy("event.updatedAt", "DESC")
      .take(limit);

    if (since) {
      qb.andWhere("event.updatedAt >= :since", { since });
    }

    const events = await qb.getMany();

    let ingested = 0;
    let skipped = 0;

    for (const event of events) {
      const title = `Meeting: ${event.title}`;
      const content = this.buildMeetingContent(event);
      if (!content) {
        skipped += 1;
        continue;
      }

      await this.aiRagService.ingestDocument(userId, title, content, [
        "meeting",
        "calendar",
      ], {
        documentId: `user:${userId}:meeting:${event.eventId}`,
      });
      ingested += 1;
    }

    return { ingested, skipped };
  }

  private async ingestNotes(
    userId: string,
    since: Date | null,
    limit: number,
  ) {
    const qb = this.noteRepo
      .createQueryBuilder("note")
      .where("note.userId = :userId", { userId })
      .orderBy("note.updatedAt", "DESC")
      .take(limit);

    if (since) {
      qb.andWhere("note.updatedAt >= :since", { since });
    }

    const notes = await qb.getMany();

    let ingested = 0;
    let skipped = 0;

    for (const note of notes) {
      const title = `Note: ${note.title}`;
      const content = this.trimText(note.content, 4000);
      if (!content) {
        skipped += 1;
        continue;
      }

      await this.aiRagService.ingestDocument(userId, title, content, [
        "note",
        "personal",
      ], {
        documentId: `user:${userId}:note:${note.noteId}`,
      });
      ingested += 1;
    }

    return { ingested, skipped };
  }

  private buildTaskContent(task: Task): string {
    const assignees = (task.assignees || [])
      .map((assignee) => assignee.user?.fullName)
      .filter((name): name is string => !!name);
    const labels = (task.labels || [])
      .map((label) => label.text)
      .filter((text): text is string => !!text);

    const lines = [
      `Title: ${task.title}`,
      `Status: ${task.status}`,
      `Priority: ${task.priority}`,
      task.description ? `Description: ${this.trimText(task.description, 1200)}` : null,
      task.board?.boardName ? `Board: ${task.board.boardName}` : null,
      task.column?.name ? `Column: ${task.column.name}` : null,
      assignees.length > 0 ? `Assignees: ${assignees.join(", ")}` : "Assignees: Unassigned",
      labels.length > 0 ? `Labels: ${labels.join(", ")}` : null,
      task.dueDate ? `Due date: ${task.dueDate.toISOString()}` : null,
    ].filter((line): line is string => !!line);

    return lines.join("\n");
  }

  private buildMeetingContent(event: CalendarEvent): string {
    const lines = [
      `Title: ${event.title}`,
      event.description ? `Description: ${this.trimText(event.description, 1200)}` : null,
      `Start: ${event.startTime.toISOString()}`,
      `End: ${event.endTime.toISOString()}`,
      event.location ? `Location: ${event.location}` : null,
      event.isAllDay ? "All day: yes" : null,
    ].filter((line): line is string => !!line);

    return lines.join("\n");
  }

  private trimText(text: string, maxLen: number): string {
    const trimmed = (text || "").trim();
    if (!trimmed) return "";
    if (trimmed.length <= maxLen) return trimmed;
    return `${trimmed.slice(0, maxLen - 3)}...`;
  }
}
