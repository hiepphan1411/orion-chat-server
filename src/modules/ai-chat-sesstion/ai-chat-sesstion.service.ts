import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { InjectRepository } from '@nestjs/typeorm';
import { Model } from 'mongoose';
import { MoreThan, Repository } from 'typeorm';
import { OllamaAiService } from 'src/common/services/ollama-ai.service';
import { AIMessageRole } from 'src/common/enums/ai-message-role.enum';
import { AIRagService } from '../ai-rag/ai-rag.service';
import { AIMessageService } from '../ai-message/ai-message.service';
import { CalendarEvent } from '../calendar-event/entities/calendar-event.entity';
import { PersonalNote } from '../notes/entities/note.entity';
import { Task } from '../task/entities/task.entity';
import { UserSettings } from '../user-settings/entities/user-settings.entity';
import { WorkspaceFile } from '../workspace-file/entities/workspace-file.entity';
import {
  AIChatSession,
  AIChatSessionDocument,
} from './ai-chat-sesstion.schema';

interface InlineAttachment {
  mimeType: string;
  data: string;
}

@Injectable()
export class AIChatSessionService {
  constructor(
    @InjectModel(AIChatSession.name)
    private sessionModel: Model<AIChatSessionDocument>,
    private readonly messageService: AIMessageService,
    private readonly aiRagService: AIRagService,
    private readonly ollamaAiService: OllamaAiService,
    private readonly configService: ConfigService,
    @InjectRepository(CalendarEvent)
    private readonly calendarEventRepo: Repository<CalendarEvent>,
    @InjectRepository(PersonalNote)
    private readonly noteRepo: Repository<PersonalNote>,
    @InjectRepository(Task)
    private readonly taskRepo: Repository<Task>,
    @InjectRepository(UserSettings)
    private readonly userSettingsRepo: Repository<UserSettings>,
    @InjectRepository(WorkspaceFile)
    private readonly workspaceFileRepo: Repository<WorkspaceFile>,
  ) {}

  async createSession(
    userId: string,
    aiModel: string,
    systemPrompt?: string,
    title?: string,
  ): Promise<AIChatSession> {
    const session = new this.sessionModel({
      userId,
      aiModel: this.normalizeAiModel(aiModel) || this.getDefaultAiModel(),
      systemPrompt,
      title: title?.trim() || 'New Conversation',
    });
    return session.save();
  }

  async getSessionsByUser(userId: string): Promise<AIChatSession[]> {
    return this.sessionModel.find({ userId }).sort({ updatedAt: -1 }).exec();
  }

  async getSessionById(sessionId: string): Promise<AIChatSession | null> {
    return this.sessionModel.findById(sessionId).exec();
  }

  async updateSession(
    sessionId: string,
    userId: string,
    update: Partial<{ aiModel: string; systemPrompt: string; title: string }>,
  ): Promise<AIChatSession | null> {
    await this.ensureSessionOwnership(sessionId, userId);
    const normalizedUpdate = {
      ...update,
      aiModel:
        update.aiModel !== undefined
          ? this.normalizeAiModel(update.aiModel) || this.getDefaultAiModel()
          : undefined,
    };

    if (normalizedUpdate.aiModel === undefined) {
      delete normalizedUpdate.aiModel;
    }

    return this.sessionModel
      .findByIdAndUpdate(sessionId, normalizedUpdate, {
        returnDocument: 'after',
      })
      .exec();
  }

  async deleteSession(
    sessionId: string,
    userId: string,
  ): Promise<AIChatSession | null> {
    await this.ensureSessionOwnership(sessionId, userId);
    await this.messageService.deleteMessagesBySession(sessionId);
    return this.sessionModel.findByIdAndDelete(sessionId).exec();
  }

  async getMessagesBySession(
    sessionId: string,
    userId: string,
  ): Promise<unknown[]> {
    await this.ensureSessionOwnership(sessionId, userId);
    return this.messageService.getMessagesBySession(sessionId);
  }

  async sendMessage(
    sessionId: string,
    userId: string,
    message: string,
    attachment?: InlineAttachment,
  ): Promise<{ assistantMessage: string; tokenUsed?: number }> {
    const trimmed = message.trim();
    const isAudioAttachment = attachment?.mimeType.startsWith('audio/');
    const isVoicePlaceholder =
      trimmed.toLowerCase() === 'voice message' || trimmed.length === 0;

    if (!trimmed && !attachment) {
      throw new BadRequestException('Message cannot be empty');
    }

    const session = await this.ensureSessionOwnership(sessionId, userId);

    await this.messageService.createMessage(
      sessionId,
      trimmed || '[Attachment]',
      AIMessageRole.USER,
    );

    const messages = await this.messageService.getMessagesBySession(sessionId);
    const chatMessages = messages.map((item) => ({
      role:
        item.aiMessageRole === AIMessageRole.USER
          ? ('user' as const)
          : ('assistant' as const),
      content: item.content,
    }));

    if (attachment) {
      const lastContent = chatMessages[chatMessages.length - 1];
      if (lastContent) {
        const attachmentNote =
          isAudioAttachment && isVoicePlaceholder
            ? 'User sent an audio attachment. Ask for a transcript if needed, and answer in Vietnamese from available context.'
            : `User sent an attachment with mime type ${attachment.mimeType}. The configured text AI cannot read raw binary data directly.`;

        lastContent.content = `${lastContent.content}\n\n[${attachmentNote}]`;
      }
    }

    const systemPrompt =
      session.systemPrompt ||
      'You are Orion AI Assistant. Be concise, practical, reliable, and answer in Vietnamese when the user writes Vietnamese.';

    const retrievalQuery =
      isAudioAttachment && isVoicePlaceholder ? '' : trimmed;
    const ragChunks = await this.aiRagService.retrieveRelevantChunks(
      userId,
      retrievalQuery,
      4,
    );

    const ragContext = ragChunks
      .map(
        (chunk, index) =>
          `[${index + 1}] ${chunk.title} (chunk ${chunk.chunkIndex}, score ${chunk.score.toFixed(3)}): ${chunk.content}`,
      )
      .join('\n\n');
    const personalMemoryContext = await this.buildPersonalMemoryContext(
      userId,
      retrievalQuery || trimmed,
    );
    const context = [
      ragContext ? `RAG_CONTEXT:\n${ragContext}` : '',
      personalMemoryContext ? `PERSONAL_MEMORY:\n${personalMemoryContext}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    const effectiveSystemPrompt = context
      ? `${systemPrompt}\n\nUse the CONTEXT below as your primary factual source. If the answer is not in context, say you are not sure. Prefer concrete deadlines, task names, calendar dates, notes, and recent files when relevant.\n\n${context}`
      : systemPrompt;

    const response = await this.ollamaAiService.generateChat({
      model: this.normalizeAiModel(session.aiModel),
      messages: [
        { role: 'system', content: effectiveSystemPrompt },
        ...chatMessages,
      ],
      temperature: 0.7,
      maxOutputTokens: 2048,
    });

    const assistantMessage =
      response.text ||
      'Xin lỗi, hệ thống AI local đang gặp sự cố. Vui lòng thử lại sau.';

    await this.messageService.createMessage(
      sessionId,
      assistantMessage,
      AIMessageRole.ASSISTANT,
      response.tokenUsed,
    );

    await this.sessionModel
      .findByIdAndUpdate(sessionId, { updatedAt: new Date() })
      .exec();

    return { assistantMessage, tokenUsed: response.tokenUsed };
  }

  private async ensureSessionOwnership(
    sessionId: string,
    userId: string,
  ): Promise<AIChatSessionDocument> {
    const session = await this.sessionModel.findById(sessionId).exec();
    if (!session) {
      throw new NotFoundException('AI session not found');
    }
    if (session.userId !== userId) {
      throw new BadRequestException('You cannot access this session');
    }
    return session;
  }

  private normalizeAiModel(model?: string) {
    if (!model) {
      return undefined;
    }
    return model;
  }

  private getDefaultAiModel() {
    const provider = (
      this.configService.get<string>('AI_PROVIDER') || 'ollama'
    ).toLowerCase();

    if (provider === 'gemini') {
      return (
        this.configService.get<string>('GEMINI_MODEL') || 'gemini-flash-latest'
      );
    }

    return this.configService.get<string>('OLLAMA_MODEL') || 'qwen2.5:7b';
  }

  private async buildPersonalMemoryContext(userId: string, query: string) {
    const settings = await this.userSettingsRepo.findOne({ where: { userId } });
    if (settings?.aiMemoryEnabled === false) {
      return '';
    }

    const lowerQuery = query.toLowerCase();
    const now = new Date();
    const [notes, events, tasks, files] = await Promise.all([
      this.noteRepo.find({
        where: { userId },
        order: { updatedAt: 'DESC' },
        take: 30,
      }),
      this.calendarEventRepo.find({
        where: {
          owner: { userId },
          endTime: MoreThan(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)),
        },
        order: { startTime: 'ASC' },
        take: 30,
      }),
      this.taskRepo.find({
        where: [{ createdBy: { userId } }, { assignees: { user: { userId } } }],
        relations: ['createdBy', 'assignees', 'assignees.user', 'board'],
        order: { updatedAt: 'DESC' },
        take: 30,
      }),
      this.workspaceFileRepo.find({
        where: { uploadedBy: { userId } },
        relations: ['workspace', 'uploadedBy'],
        order: { createdAt: 'DESC' },
        take: 20,
      }),
    ]);

    const matchesQuery = (text: string) =>
      !lowerQuery ||
      lowerQuery
        .split(/\s+/)
        .filter((token) => token.length >= 3)
        .some((token) => text.toLowerCase().includes(token));

    return [
      ...notes
        .filter((note) => matchesQuery(`${note.title} ${note.content}`))
        .slice(0, 8)
        .map(
          (note) =>
            `[note:${note.noteId}] ${note.title}: ${this.truncate(note.content, 500)}`,
        ),
      ...events.slice(0, 8).map(
        (event) =>
          `[calendar:${event.eventId}] ${event.title}: ${event.startTime.toISOString()} - ${event.endTime.toISOString()} ${event.description || ''}`,
      ),
      ...tasks
        .filter((task) =>
          matchesQuery(`${task.title} ${task.description || ''}`),
        )
        .slice(0, 10)
        .map((task) => {
          const assignees =
            task.assignees
              ?.map((item) => item.user?.fullName)
              .filter(Boolean)
              .join(', ') || 'Unassigned';
          return `[task:${task.taskId}] ${task.title} | status=${task.status} | priority=${task.priority} | dueDate=${task.dueDate?.toISOString() || 'none'} | assignees=${assignees} | ${task.description || ''}`;
        }),
      ...files
        .filter((file) => matchesQuery(`${file.name} ${file.mimeType || ''}`))
        .slice(0, 8)
        .map(
          (file) =>
            `[file:${file.fileId}] ${file.name} (${file.mimeType || file.type}) uploadedAt=${file.createdAt.toISOString()}`,
        ),
    ].join('\n');
  }

  private truncate(text: string, max: number) {
    if (text.length <= max) {
      return text;
    }
    return `${text.slice(0, max - 3).trim()}...`;
  }
}
