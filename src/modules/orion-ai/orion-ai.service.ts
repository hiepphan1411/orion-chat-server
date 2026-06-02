import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { InjectRepository } from '@nestjs/typeorm';
import { Model } from 'mongoose';
import { In, MoreThan, Not, Repository } from 'typeorm';
import { OllamaAiService } from 'src/common/services/ollama-ai.service';
import { Priority } from 'src/common/enums/priority.enum';
import { TaskStatus } from 'src/common/enums/task-status.enum';
import { Message, MessageDocument } from '../message/message.schema';
import { ChatMembershipService } from '../message/services/chat-membership.service';
import { ConversationParticipant } from '../conversation/entities/conversation-participant.entity';
import { User } from '../users/entities/user.entity';
import { UserSettings } from '../user-settings/entities/user-settings.entity';
import { Workspace } from '../workspace/entities/workspace.entity';
import { WorkspaceMember } from '../workspace-member/entities/workspace-member.entity';
import { Task } from '../task/entities/task.entity';
import { TaskBoard } from '../task-board/entities/task-board.entity';
import { Sprint } from '../sprint/entities/sprint.entity';
import { CalendarEvent } from '../calendar-event/entities/calendar-event.entity';
import { PersonalNote } from '../notes/entities/note.entity';
import { Document } from '../document/entities/document.entity';
import { WorkspaceFile } from '../workspace-file/entities/workspace-file.entity';
import { AIRagService, RagChunkScore } from '../ai-rag/ai-rag.service';
import {
  AnalyzeTextDto,
  ChatSummaryMode,
  DeadlineInsightsDto,
  DocumentAssistDto,
  EmotionDetectionDto,
  KnowledgeSearchDto,
  ReplySuggestionsDto,
  RewriteMessageDto,
  SprintSummaryDto,
  SummarizeConversationDto,
  TaskDraftDto,
  UpdateAiSettingsDto,
  WorkspaceAskDto,
} from './dto/orion-ai.dto';

type AiCardTone = 'neutral' | 'positive' | 'warning' | 'danger' | 'info';

interface AiCard {
  id: string;
  title: string;
  subtitle?: string;
  body?: string;
  tone?: AiCardTone;
  icon?: string;
  meta?: Record<string, unknown>;
}

interface AiTable {
  columns: Array<{ key: string; label: string; width?: string }>;
  rows: Array<Record<string, unknown>>;
}

interface AiAction {
  id: string;
  label: string;
  type: 'create_task' | 'create_event' | 'open_item' | 'copy_text' | 'none';
  payload?: Record<string, unknown>;
  disabled?: boolean;
}

export interface AiGridResponse {
  id: string;
  type: string;
  title: string;
  summary: string;
  confidence: number;
  generatedAt: string;
  layout: {
    variant: 'grid' | 'table' | 'compact' | 'empty';
    columns: { mobile: number; tablet: number; desktop: number };
  };
  cards: AiCard[];
  table?: AiTable;
  actions: AiAction[];
  meta: Record<string, unknown>;
}

interface ChatMessageSnippet {
  id: string;
  senderBy: string;
  senderName: string;
  content: string;
  createdAt: string;
}

interface LlmGridPayload {
  title?: string;
  summary?: string;
  confidence?: number;
  cards?: AiCard[];
  table?: AiTable;
  actions?: AiAction[];
}

@Injectable()
export class OrionAiService {
  constructor(
    @InjectModel(Message.name)
    private readonly messageModel: Model<MessageDocument>,
    @InjectRepository(ConversationParticipant)
    private readonly participantRepo: Repository<ConversationParticipant>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(UserSettings)
    private readonly userSettingsRepo: Repository<UserSettings>,
    @InjectRepository(Workspace)
    private readonly workspaceRepo: Repository<Workspace>,
    @InjectRepository(WorkspaceMember)
    private readonly workspaceMemberRepo: Repository<WorkspaceMember>,
    @InjectRepository(Task)
    private readonly taskRepo: Repository<Task>,
    @InjectRepository(TaskBoard)
    private readonly taskBoardRepo: Repository<TaskBoard>,
    @InjectRepository(Sprint)
    private readonly sprintRepo: Repository<Sprint>,
    @InjectRepository(CalendarEvent)
    private readonly calendarEventRepo: Repository<CalendarEvent>,
    @InjectRepository(PersonalNote)
    private readonly noteRepo: Repository<PersonalNote>,
    @InjectRepository(Document)
    private readonly documentRepo: Repository<Document>,
    @InjectRepository(WorkspaceFile)
    private readonly workspaceFileRepo: Repository<WorkspaceFile>,
    private readonly chatMembershipService: ChatMembershipService,
    private readonly aiRagService: AIRagService,
    private readonly ollama: OllamaAiService,
  ) {}

  async summarizeConversation(userId: string, dto: SummarizeConversationDto) {
    await this.chatMembershipService.assertConversationMember(
      userId,
      dto.conversationId,
    );

    const mode = dto.mode || ChatSummaryMode.RANGE;
    const months = dto.rangeMonths || 1;
    const messages =
      mode === ChatSummaryMode.UNREAD
        ? await this.getUnreadMessages(userId, dto.conversationId)
        : await this.getConversationMessages(dto.conversationId, {
            since: this.monthsAgo(months),
            limit: 250,
          });

    if (mode === ChatSummaryMode.UNREAD && messages.length === 0) {
      return this.grid({
        type: 'chat_summary',
        title: 'Không có tin nhắn chưa đọc',
        summary: 'Cuộc hội thoại này hiện không có nội dung mới để tóm tắt.',
        variant: 'empty',
        cards: [],
        actions: [
          {
            id: 'summarize_unread',
            label: 'Tóm tắt tin chưa đọc',
            type: 'none',
            disabled: true,
          },
        ],
        meta: { conversationId: dto.conversationId, mode, months },
      });
    }

    const fallback = this.fallbackSummary(messages, mode, months);
    return this.runGridPrompt({
      type: 'chat_summary',
      title: fallback.title,
      source: this.formatMessages(messages),
      fallback,
      instruction:
        'Tóm tắt hội thoại Orion Chat bằng tiếng Việt. Trả về điểm chính, quyết định, deadline, người cần phản hồi và rủi ro. Ưu tiên response dạng grid/cards/table, ngắn gọn, chuyên nghiệp.',
      meta: {
        conversationId: dto.conversationId,
        mode,
        rangeMonths: months,
        messageCount: messages.length,
      },
    });
  }

  async suggestReplies(userId: string, dto: ReplySuggestionsDto) {
    await this.chatMembershipService.assertConversationMember(
      userId,
      dto.conversationId,
    );

    const messages = await this.getConversationMessages(dto.conversationId, {
      limit: 40,
    });
    const limit = dto.limit || 4;
    const replySuggestions = this.localReplySuggestions(messages, limit);
    const fallback = this.grid({
      type: 'reply_suggestions',
      title: 'Gợi ý trả lời',
      summary: 'Một vài câu trả lời phù hợp với mạch hội thoại gần đây.',
      cards: replySuggestions.map((text, index) => ({
        id: `reply_${index + 1}`,
        title: text,
        tone: 'info',
        icon: 'message-square-text',
      })),
      actions: replySuggestions.map((text, index) => ({
        id: `use_reply_${index + 1}`,
        label: `Dùng gợi ý ${index + 1}`,
        type: 'copy_text',
        payload: { text },
      })),
      meta: { conversationId: dto.conversationId, limit },
    });

    return this.runGridPrompt({
      type: 'reply_suggestions',
      title: 'Gợi ý trả lời',
      source: this.formatMessages(messages),
      fallback,
      instruction: `Đề xuất ${limit} câu trả lời bằng tiếng Việt, tự nhiên, phù hợp tone của đoạn chat. Mỗi card.title là một câu có thể gửi ngay, không quá dài.`,
      meta: { conversationId: dto.conversationId, limit },
    });
  }

  async rewriteMessage(userId: string, dto: RewriteMessageDto) {
    const message = this.ollama.sanitize(dto.message, 4000);
    const fallbackText = this.localRewrite(message, dto.tone);
    const fallback = this.grid({
      type: 'rewrite_message',
      title: 'Rewrite message',
      summary: fallbackText,
      cards: [
        {
          id: 'rewritten_message',
          title: 'Tin nhắn đã viết lại',
          body: fallbackText,
          tone: 'positive',
          icon: 'wand-sparkles',
          meta: { original: message, tone: dto.tone },
        },
      ],
      actions: [
        {
          id: 'copy_rewrite',
          label: 'Dùng bản viết lại',
          type: 'copy_text',
          payload: { text: fallbackText },
        },
        {
          id: 'undo_rewrite',
          label: 'Undo',
          type: 'copy_text',
          payload: { text: message },
        },
      ],
      meta: { userId, tone: dto.tone, audience: dto.audience || null },
    });

    return this.runGridPrompt({
      type: 'rewrite_message',
      title: 'Rewrite message',
      source: message,
      fallback,
      instruction: `Viết lại tin nhắn theo tone "${dto.tone}". Audience: ${dto.audience || 'người nhận trong chat'}. Trả về 1 card chính, body là tin nhắn viết lại. Giữ đúng ý, không thêm thông tin mới.`,
      meta: fallback.meta,
    });
  }

  async analyzeText(userId: string, dto: AnalyzeTextDto) {
    const text = this.ollama.sanitize(dto.text, 5000);
    if (dto.conversationId) {
      await this.chatMembershipService.assertConversationMember(
        userId,
        dto.conversationId,
      );
    }
    if (dto.workspaceId) {
      await this.assertWorkspaceAccess(userId, dto.workspaceId);
    }

    const fallback = this.localTextWorkflow(text, dto);
    return this.runGridPrompt({
      type: 'text_to_workflow',
      title: 'AI text message',
      source: text,
      fallback,
      instruction:
        'Phân tích text chat realtime. Detect lịch họp, deadline, task, blocker, urgency. Không tự tạo dữ liệu; trả về action payload dạng create_event/create_task để frontend xác nhận.',
      meta: {
        conversationId: dto.conversationId || null,
        workspaceId: dto.workspaceId || null,
      },
    });
  }

  async createTaskDraft(userId: string, dto: TaskDraftDto) {
    if (dto.conversationId) {
      await this.chatMembershipService.assertConversationMember(
        userId,
        dto.conversationId,
      );
    }
    if (dto.workspaceId) {
      await this.assertWorkspaceAccess(userId, dto.workspaceId);
    }

    const messages = dto.conversationId
      ? await this.getConversationMessages(dto.conversationId, { limit: 80 })
      : [];
    const source = [dto.text || '', this.formatMessages(messages)]
      .filter(Boolean)
      .join('\n\n');

    if (!source.trim()) {
      throw new BadRequestException('text or conversationId is required');
    }

    const fallback = this.localTaskDraft(source, dto.workspaceId);
    return this.runGridPrompt({
      type: 'task_draft',
      title: 'Task Management AI Agent',
      source,
      fallback,
      instruction:
        'Bạn là Project Coordinator của WorkHub. Phân tích chat/text để tạo task draft: title, description, priority, dueDate ISO nếu có, blocker, assigneeName nếu có. Trả về cards và actions create_task.',
      meta: {
        conversationId: dto.conversationId || null,
        workspaceId: dto.workspaceId || null,
      },
    });
  }

  async deadlineInsights(userId: string, dto: DeadlineInsightsDto) {
    if (dto.workspaceId) {
      await this.assertWorkspaceAccess(userId, dto.workspaceId);
    }

    const tasks = await this.getTasksForInsights(dto.workspaceId);
    const fallback = this.localDeadlineInsights(tasks);
    return this.runGridPrompt({
      type: 'deadline_insights',
      title: 'Smart Deadline Agent',
      source: this.formatTasks(tasks),
      fallback,
      instruction:
        'Theo dõi task chưa hoàn thành, deadline gần/trễ, tiến độ chậm và thành viên inactive nếu có dữ liệu. Trả về cảnh báo sớm dạng cards/table.',
      meta: { workspaceId: dto.workspaceId || null, taskCount: tasks.length },
    });
  }

  async sprintSummary(userId: string, dto: SprintSummaryDto) {
    if (dto.workspaceId) {
      await this.assertWorkspaceAccess(userId, dto.workspaceId);
    }

    const tasks = await this.getTasksForInsights(dto.workspaceId, dto.sprintId);
    const sprint = dto.sprintId
      ? await this.sprintRepo.findOne({
          where: { sprintId: dto.sprintId },
          relations: ['workspace'],
        })
      : null;
    const fallback = this.localSprintSummary(tasks, sprint?.name);

    return this.runGridPrompt({
      type: 'sprint_summary',
      title: 'AI Sprint Summary',
      source: `SPRINT: ${sprint?.name || 'current scope'}\n\n${this.formatTasks(tasks)}`,
      fallback,
      instruction:
        'Generate WorkHub AI Insights giống mini Jira AI: tổng kết công việc, completed task, blocked task, productivity, risks, next actions. Trả về grid/cards/table.',
      meta: {
        workspaceId: dto.workspaceId || null,
        sprintId: dto.sprintId || null,
        taskCount: tasks.length,
      },
    });
  }

  async detectEmotion(userId: string, dto: EmotionDetectionDto) {
    const settings = await this.getOrCreateAiSettings(userId);
    if (!settings.smartEmotionDetection) {
      return this.grid({
        type: 'emotion_detection',
        title: 'Smart Emotion Detection đang tắt',
        summary: 'Bật tính năng trong cài đặt chat để AI gợi ý cảm xúc.',
        variant: 'empty',
        cards: [],
        actions: [
          {
            id: 'enable_emotion_detection',
            label: 'Bật Smart Emotion Detection',
            type: 'none',
          },
        ],
        meta: { enabled: false },
      });
    }

    const text = await this.resolveEmotionText(userId, dto);
    const fallback = this.localEmotion(text);
    return this.runGridPrompt({
      type: 'emotion_detection',
      title: 'Smart Emotion Detection',
      source: text,
      fallback,
      instruction:
        'Detect tone của tin nhắn. Chỉ dùng các nhãn: angry, stress, urgent, positive, neutral. Trả về icon lucide phù hợp, tone mờ/gợi ý, không phán xét người gửi.',
      meta: { enabled: true, messageId: dto.messageId || null },
    });
  }

  async documentAssist(userId: string, dto: DocumentAssistDto) {
    if (dto.workspaceId) {
      await this.assertWorkspaceAccess(userId, dto.workspaceId);
    }

    const document = dto.documentId
      ? await this.documentRepo.findOne({
          where: { documentId: dto.documentId },
          relations: ['workspace', 'createdBy', 'lastEditedBy'],
        })
      : null;

    if (dto.documentId && !document) {
      throw new NotFoundException('Document not found');
    }
    if (document?.workspace?.workspaceId) {
      await this.assertWorkspaceAccess(userId, document.workspace.workspaceId);
    }

    const prompt = this.ollama.sanitize(dto.prompt, 4000);
    const source = [
      `REQUEST: ${prompt}`,
      dto.selectedText ? `SELECTED_TEXT:\n${dto.selectedText}` : '',
      document ? `DOCUMENT_TITLE: ${document.title}\nDOCUMENT:\n${document.content}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    const fallback = this.grid({
      type: 'document_assist',
      title: 'AI Document Collaboration',
      summary: 'Nội dung nháp đã được tạo từ yêu cầu @AI.',
      cards: [
        {
          id: 'doc_draft',
          title: 'Draft',
          body: dto.selectedText || prompt,
          tone: 'info',
          icon: 'file-pen-line',
        },
      ],
      actions: [
        {
          id: 'insert_document_content',
          label: 'Chèn vào tài liệu',
          type: 'copy_text',
          payload: { text: dto.selectedText || prompt },
        },
      ],
      meta: {
        documentId: dto.documentId || null,
        workspaceId: dto.workspaceId || document?.workspace?.workspaceId || null,
      },
    });

    return this.runGridPrompt({
      type: 'document_assist',
      title: 'AI Document Collaboration',
      source,
      fallback,
      instruction:
        'Hỗ trợ document realtime khi user nhập @AI: viết tài liệu, summarize docs, convert text thành checklist. Trả về nội dung có thể chèn ngay trong cards[0].body.',
      meta: fallback.meta,
    });
  }

  async knowledgeSearch(userId: string, dto: KnowledgeSearchDto) {
    if (dto.workspaceId) {
      await this.assertWorkspaceAccess(userId, dto.workspaceId);
    }

    const query = this.ollama.sanitize(dto.query, 2000);
    const [ragChunks, workspaceContext, memoryContext] = await Promise.all([
      this.aiRagService.retrieveRelevantChunks(userId, query, dto.topK || 4, {
        deduplicateByDocument: true,
      }),
      this.findWorkspaceKnowledge(dto.workspaceId, query),
      this.findPersonalMemory(userId, query),
    ]);

    const fallback = this.localKnowledgeSearch(
      query,
      ragChunks,
      workspaceContext,
      memoryContext,
    );

    return this.runGridPrompt({
      type: 'knowledge_search',
      title: 'AI Knowledge Search',
      source: [
        `QUERY: ${query}`,
        this.formatRagChunks(ragChunks),
        workspaceContext.join('\n'),
        memoryContext.join('\n'),
      ].join('\n\n'),
      fallback,
      instruction:
        'Trả lời search toàn workspace bằng tiếng Việt. Chỉ dùng context được đưa. Nếu không chắc, nói không chắc. Trả về kết quả dạng grid/cards/table, mỗi card có source meta.',
      meta: {
        workspaceId: dto.workspaceId || null,
        ragCount: ragChunks.length,
        workspaceHitCount: workspaceContext.length,
        memoryHitCount: memoryContext.length,
      },
    });
  }

  async askWorkspace(userId: string, dto: WorkspaceAskDto) {
    await this.assertWorkspaceAccess(userId, dto.workspaceId);
    const question = this.ollama.sanitize(dto.question, 2000);
    const tasks = await this.getTasksForInsights(dto.workspaceId);
    const workspace = await this.workspaceRepo.findOne({
      where: { workspaceId: dto.workspaceId },
    });
    const docs = await this.findWorkspaceKnowledge(dto.workspaceId, question);

    const fallback = this.grid({
      type: 'workspace_agent',
      title: workspace?.workspaceName || 'AI Workspace Agent',
      summary: this.summarizeWorkspaceLocally(question, tasks),
      cards: this.localDeadlineInsights(tasks).cards.slice(0, 4),
      actions: [],
      meta: { workspaceId: dto.workspaceId, question },
    });

    return this.runGridPrompt({
      type: 'workspace_agent',
      title: workspace?.workspaceName || 'AI Workspace Agent',
      source: [
        `QUESTION: ${question}`,
        `WORKSPACE: ${workspace?.workspaceName || dto.workspaceId}`,
        this.formatTasks(tasks),
        docs.join('\n'),
      ].join('\n\n'),
      fallback,
      instruction:
        'Bạn là AI riêng của workspace. Hiểu task, thành viên, deadline, tài liệu team. Trả lời ngắn gọn, contextual, dạng grid/cards/table.',
      meta: { workspaceId: dto.workspaceId, question },
    });
  }

  async getAiSettings(userId: string) {
    return this.getOrCreateAiSettings(userId);
  }

  async updateAiSettings(userId: string, dto: UpdateAiSettingsDto) {
    const settings = await this.getOrCreateAiSettings(userId);
    const mutable = settings as UserSettings & {
      smartEmotionDetection?: boolean;
      autoWorkflowSuggestions?: boolean;
      aiMemoryEnabled?: boolean;
      enabledAgents?: string[];
    };

    if (dto.smartEmotionDetection !== undefined) {
      mutable.smartEmotionDetection = dto.smartEmotionDetection;
    }
    if (dto.autoWorkflowSuggestions !== undefined) {
      mutable.autoWorkflowSuggestions = dto.autoWorkflowSuggestions;
    }
    if (dto.aiMemoryEnabled !== undefined) {
      mutable.aiMemoryEnabled = dto.aiMemoryEnabled;
    }
    if (dto.enabledAgents !== undefined) {
      mutable.enabledAgents = dto.enabledAgents;
    }

    return this.userSettingsRepo.save(mutable);
  }

  private async runGridPrompt(options: {
    type: string;
    title: string;
    instruction: string;
    source: string;
    fallback: AiGridResponse;
    meta: Record<string, unknown>;
  }): Promise<AiGridResponse> {
    const source = this.truncate(options.source, 14000);
    const response = await this.ollama.generateJson<LlmGridPayload>({
      systemPrompt: [
        'You are Orion AI for Orion Chat / WorkHub.',
        'Always answer in Vietnamese unless source text is clearly another language.',
        'Return only valid JSON. No markdown.',
        'JSON shape: {"title":string,"summary":string,"confidence":number,"cards":[{"id":string,"title":string,"subtitle":string,"body":string,"tone":"neutral|positive|warning|danger|info","icon":string,"meta":object}],"table":{"columns":[{"key":string,"label":string}],"rows":[object]},"actions":[{"id":string,"label":string,"type":"create_task|create_event|open_item|copy_text|none","payload":object,"disabled":boolean}]}',
        'Use lucide icon names such as message-square-text, list-checks, calendar-plus, alert-triangle, file-text, search, smile-plus.',
      ].join('\n'),
      userPrompt: `${options.instruction}\n\nSOURCE:\n${source}`,
      fallback: this.toLlmFallback(options.fallback),
      temperature: 0.25,
      maxOutputTokens: 2500,
    });

    const normalized = this.grid({
      type: options.type,
      title: response.data.title || options.title,
      summary: response.data.summary || options.fallback.summary,
      confidence: response.data.confidence ?? options.fallback.confidence,
      cards: response.data.cards?.length
        ? response.data.cards
        : options.fallback.cards,
      table: response.data.table || options.fallback.table,
      actions: response.data.actions?.length
        ? response.data.actions
        : options.fallback.actions,
      meta: {
        ...options.meta,
        tokenUsed: response.tokenUsed || null,
        usedFallback: response.usedFallback,
      },
    });

    return normalized;
  }

  private grid(input: {
    type: string;
    title: string;
    summary: string;
    cards: AiCard[];
    actions: AiAction[];
    table?: AiTable;
    meta?: Record<string, unknown>;
    confidence?: number;
    variant?: 'grid' | 'table' | 'compact' | 'empty';
  }): AiGridResponse {
    const variant =
      input.variant ||
      (input.table ? 'table' : input.cards.length > 0 ? 'grid' : 'empty');

    return {
      id: `${input.type}_${Date.now()}`,
      type: input.type,
      title: input.title,
      summary: input.summary,
      confidence: Math.max(0, Math.min(input.confidence ?? 0.72, 1)),
      generatedAt: new Date().toISOString(),
      layout: {
        variant,
        columns: { mobile: 1, tablet: 2, desktop: 3 },
      },
      cards: input.cards.map((card, index) => ({
        ...card,
        id: card.id || `${input.type}_${index + 1}`,
        tone: card.tone || 'neutral',
        icon: card.icon || 'sparkles',
      })),
      table: input.table,
      actions: input.actions,
      meta: input.meta || {},
    };
  }

  private async getConversationMessages(
    conversationId: string,
    options: { since?: Date; limit?: number } = {},
  ): Promise<ChatMessageSnippet[]> {
    const filter: Record<string, unknown> = {
      conversationId,
      isDeleted: false,
      isRevoked: false,
    };
    if (options.since) {
      filter.createdAt = { $gte: options.since };
    }

    const rows = await this.messageModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(Math.min(options.limit || 80, 300))
      .lean<
        Array<{
          _id: unknown;
          senderBy: string;
          content?: string;
          createdAt: Date;
        }>
      >()
      .exec();

    return this.hydrateMessageSenders(rows.reverse());
  }

  private async getUnreadMessages(
    userId: string,
    conversationId: string,
  ): Promise<ChatMessageSnippet[]> {
    const participant = await this.participantRepo.findOne({
      where: { userId, conversationId },
    });
    if (!participant) {
      return [];
    }

    let since: Date | null = null;
    if (participant.lastReadMessageId) {
      const lastRead = await this.messageModel
        .findById(participant.lastReadMessageId)
        .select('createdAt')
        .lean<{ createdAt?: Date } | null>()
        .exec();
      since = lastRead?.createdAt || null;
    }

    const filter: Record<string, unknown> = {
      conversationId,
      isDeleted: false,
      isRevoked: false,
      senderBy: { $ne: userId },
    };
    if (since) {
      filter.createdAt = { $gt: since };
    }

    const rows = await this.messageModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(120)
      .lean<
        Array<{
          _id: unknown;
          senderBy: string;
          content?: string;
          createdAt: Date;
        }>
      >()
      .exec();

    return this.hydrateMessageSenders(rows.reverse());
  }

  private async hydrateMessageSenders(
    rows: Array<{
      _id: unknown;
      senderBy: string;
      content?: string;
      createdAt: Date;
    }>,
  ): Promise<ChatMessageSnippet[]> {
    const senderIds = Array.from(new Set(rows.map((item) => item.senderBy)));
    const users = senderIds.length
      ? await this.userRepo.find({ where: { userId: In(senderIds) } })
      : [];
    const nameById = new Map(users.map((user) => [user.userId, user.fullName]));

    return rows
      .filter((item) => String(item.content || '').trim().length > 0)
      .map((item) => ({
        id: String(item._id),
        senderBy: item.senderBy,
        senderName: nameById.get(item.senderBy) || item.senderBy,
        content: String(item.content || ''),
        createdAt: item.createdAt.toISOString(),
      }));
  }

  private async assertWorkspaceAccess(userId: string, workspaceId: string) {
    const workspace = await this.workspaceRepo.findOne({
      where: { workspaceId },
      relations: ['owner'],
    });
    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }
    if (workspace.owner?.userId === userId) {
      return workspace;
    }

    const membership = await this.workspaceMemberRepo.findOne({
      where: {
        workspace: { workspaceId },
        user: { userId },
      },
      relations: ['workspace', 'user'],
    });
    if (!membership) {
      throw new BadRequestException('You cannot access this workspace');
    }
    return workspace;
  }

  private async getTasksForInsights(workspaceId?: string, sprintId?: string) {
    const where: Record<string, unknown> = {};
    if (workspaceId) {
      where.board = { workspace: { workspaceId } };
    }
    if (sprintId) {
      where.sprint = { sprintId };
    }

    return this.taskRepo.find({
      where,
      relations: [
        'board',
        'board.workspace',
        'assignees',
        'assignees.user',
        'sprint',
      ],
      order: { dueDate: 'ASC', updatedAt: 'DESC' },
      take: 250,
    });
  }

  private async findWorkspaceKnowledge(workspaceId: string | undefined, query: string) {
    if (!workspaceId) {
      return [];
    }
    const keyword = `%${query.slice(0, 80)}%`;
    const [docs, files] = await Promise.all([
      this.documentRepo.find({
        where: [
          { workspace: { workspaceId }, title: Not('') },
          { workspace: { workspaceId }, content: Not('') },
        ],
        relations: ['workspace', 'createdBy', 'lastEditedBy'],
        order: { updatedAt: 'DESC' },
        take: 20,
      }),
      this.workspaceFileRepo.find({
        where: { workspace: { workspaceId } },
        relations: ['workspace', 'uploadedBy'],
        order: { uploadedAt: 'DESC' },
        take: 20,
      }),
    ]);

    const lower = query.toLowerCase();
    return [
      ...docs
        .filter(
          (doc) =>
            doc.title.toLowerCase().includes(lower) ||
            doc.content.toLowerCase().includes(lower) ||
            keyword.length > 0,
        )
        .slice(0, 8)
        .map(
          (doc) =>
            `[document:${doc.documentId}] ${doc.title}: ${this.truncate(doc.content, 700)}`,
        ),
      ...files
        .filter((file) => file.name.toLowerCase().includes(lower) || true)
        .slice(0, 8)
        .map(
          (file) =>
            `[file:${file.fileId}] ${file.name} (${file.mimeType || file.type}) ${file.url || ''}`,
        ),
    ];
  }

  private async findPersonalMemory(userId: string, query: string) {
    const lower = query.toLowerCase();
    const [notes, calendar] = await Promise.all([
      this.noteRepo.find({
        where: { userId },
        order: { updatedAt: 'DESC' },
        take: 40,
      }),
      this.calendarEventRepo.find({
        where: {
          owner: { userId },
          endTime: MoreThan(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)),
        },
        relations: ['owner', 'participants'],
        order: { startTime: 'ASC' },
        take: 40,
      }),
    ]);

    return [
      ...notes
        .filter(
          (note) =>
            note.title.toLowerCase().includes(lower) ||
            note.content.toLowerCase().includes(lower),
        )
        .slice(0, 8)
        .map(
          (note) =>
            `[note:${note.noteId}] ${note.title}: ${this.truncate(note.content, 600)}`,
        ),
      ...calendar
        .filter(
          (event) =>
            event.title.toLowerCase().includes(lower) ||
            event.description.toLowerCase().includes(lower),
        )
        .slice(0, 8)
        .map(
          (event) =>
            `[calendar:${event.eventId}] ${event.title}: ${event.startTime.toISOString()} - ${event.endTime.toISOString()}`,
        ),
    ];
  }

  private async resolveEmotionText(userId: string, dto: EmotionDetectionDto) {
    if (dto.text) {
      return this.ollama.sanitize(dto.text, 2000);
    }
    if (!dto.messageId) {
      throw new BadRequestException('messageId or text is required');
    }

    const message = await this.messageModel
      .findById(dto.messageId)
      .lean<{
        conversationId: string;
        content?: string;
      } | null>()
      .exec();
    if (!message) {
      throw new NotFoundException('Message not found');
    }

    await this.chatMembershipService.assertConversationMember(
      userId,
      message.conversationId,
    );
    return this.ollama.sanitize(message.content || '', 2000);
  }

  private async getOrCreateAiSettings(userId: string) {
    let settings = await this.userSettingsRepo.findOne({ where: { userId } });
    if (!settings) {
      settings = this.userSettingsRepo.create({
        userId,
        theme: 'light',
        fontSize: 16,
        wallpaper: '',
        fontFamily: 'Inter',
        accentColor: '#3B82F6',
      });
    }

    const mutable = settings as UserSettings & {
      smartEmotionDetection?: boolean;
      autoWorkflowSuggestions?: boolean;
      aiMemoryEnabled?: boolean;
      enabledAgents?: string[];
    };
    mutable.smartEmotionDetection ??= false;
    mutable.autoWorkflowSuggestions ??= true;
    mutable.aiMemoryEnabled ??= true;
    mutable.enabledAgents ??= [
      'core_assistant',
      'task_agent',
      'deadline_agent',
      'sprint_summary',
      'document_agent',
      'knowledge_search',
      'workspace_agent',
    ];

    return this.userSettingsRepo.save(mutable);
  }

  private toLlmFallback(response: AiGridResponse): LlmGridPayload {
    return {
      title: response.title,
      summary: response.summary,
      confidence: response.confidence,
      cards: response.cards,
      table: response.table,
      actions: response.actions,
    };
  }

  private fallbackSummary(
    messages: ChatMessageSnippet[],
    mode: ChatSummaryMode,
    months: number,
  ) {
    const topMessages = messages.slice(-6);
    return this.grid({
      type: 'chat_summary',
      title:
        mode === ChatSummaryMode.UNREAD
          ? 'Tóm tắt tin nhắn chưa đọc'
          : `Tóm tắt ${months} tháng gần đây`,
      summary:
        messages.length > 0
          ? `Đã phân tích ${messages.length} tin nhắn gần đây.`
          : 'Không có đủ tin nhắn để tóm tắt.',
      cards: topMessages.map((message) => ({
        id: message.id,
        title: message.senderName,
        subtitle: message.createdAt,
        body: this.truncate(message.content, 180),
        icon: 'message-square-text',
        tone: 'neutral',
      })),
      actions: [],
      meta: { mode, months, messageCount: messages.length },
    });
  }

  private localReplySuggestions(messages: ChatMessageSnippet[], limit: number) {
    const last = messages[messages.length - 1]?.content.toLowerCase() || '';
    const urgent = /gấp|urgent|asap|ngay|deadline|trễ/.test(last);
    const question = /\?|không|chưa|được không|nhé/.test(last);
    const suggestions = urgent
      ? [
          'Mình nhận được rồi, mình sẽ ưu tiên xử lý ngay.',
          'Để mình kiểm tra nhanh và phản hồi bạn trong ít phút nữa.',
          'Mình đang xem phần này, nếu có blocker mình sẽ báo ngay.',
          'Ok, mình sẽ cập nhật tiến độ sớm nhất.',
        ]
      : question
        ? [
            'Được nhé, để mình kiểm tra lại rồi xác nhận.',
            'Mình thấy phương án này ổn, mình sẽ follow tiếp.',
            'Bạn cho mình thêm chút context để mình xử lý chính xác hơn nhé.',
            'Mình đồng ý, mình sẽ cập nhật khi xong.',
          ]
        : [
            'Mình đã nắm thông tin rồi nhé.',
            'Cảm ơn bạn, mình sẽ cập nhật thêm khi có tiến độ.',
            'Ok nhé, mình sẽ theo dõi phần này.',
            'Mình ghi nhận và sẽ xử lý tiếp.',
          ];
    return suggestions.slice(0, limit);
  }

  private localRewrite(message: string, tone: string) {
    if (tone === 'concise') {
      return message.length > 160
        ? `${message.slice(0, 157).trim()}...`
        : message;
    }
    if (tone === 'polite') {
      return `Bạn xem giúp mình nội dung này nhé: ${message}`;
    }
    return `Mình xin phép cập nhật: ${message}`;
  }

  private localTextWorkflow(text: string, dto: AnalyzeTextDto) {
    const dueDate = this.detectRelativeDate(text);
    const isMeeting = /họp|meeting|call|trao đổi|sync/i.test(text);
    const isTask = /deploy|fix|bug|làm|xử lý|task|deadline|ship/i.test(text);
    const cards: AiCard[] = [];
    const actions: AiAction[] = [];

    if (isMeeting) {
      cards.push({
        id: 'calendar_draft',
        title: 'Có thể tạo lịch họp',
        body: text,
        tone: 'info',
        icon: 'calendar-plus',
        meta: { startHint: dueDate },
      });
      actions.push({
        id: 'create_event_draft',
        label: 'Tạo lịch nháp',
        type: 'create_event',
        payload: { title: this.toTitle(text), description: text, startHint: dueDate },
      });
    }
    if (isTask) {
      cards.push({
        id: 'task_draft',
        title: this.toTitle(text),
        body: text,
        tone: dueDate ? 'warning' : 'info',
        icon: 'list-checks',
        meta: { dueDate },
      });
      actions.push({
        id: 'create_task_draft',
        label: 'Tạo task nháp',
        type: 'create_task',
        payload: {
          title: this.toTitle(text),
          description: text,
          priority: this.detectPriority(text),
          dueDate,
          workspaceId: dto.workspaceId || null,
        },
      });
    }

    return this.grid({
      type: 'text_to_workflow',
      title: 'AI text message',
      summary: cards.length
        ? 'AI tìm thấy workflow có thể tạo từ nội dung chat.'
        : 'Chưa phát hiện workflow rõ ràng từ nội dung này.',
      cards,
      actions,
      meta: { conversationId: dto.conversationId || null, workspaceId: dto.workspaceId || null },
    });
  }

  private localTaskDraft(source: string, workspaceId?: string) {
    const title = this.toTitle(source);
    const dueDate = this.detectRelativeDate(source);
    return this.grid({
      type: 'task_draft',
      title: 'Task draft',
      summary: `Đề xuất tạo task "${title}".`,
      cards: [
        {
          id: 'task_1',
          title,
          body: this.truncate(source, 360),
          tone: dueDate ? 'warning' : 'info',
          icon: 'list-checks',
          meta: {
            priority: this.detectPriority(source),
            dueDate,
            blocker: /block|blocked|kẹt|vướng/i.test(source),
          },
        },
      ],
      actions: [
        {
          id: 'create_task_1',
          label: 'Tạo task',
          type: 'create_task',
          payload: {
            title,
            description: this.truncate(source, 1200),
            priority: this.detectPriority(source),
            dueDate,
            workspaceId: workspaceId || null,
          },
        },
      ],
      meta: { workspaceId: workspaceId || null },
    });
  }

  private localDeadlineInsights(tasks: Task[]) {
    const now = new Date();
    const riskTasks = tasks
      .filter((task) => task.status !== TaskStatus.DONE && task.status !== TaskStatus.ARCHIVED)
      .filter((task) => task.dueDate && task.dueDate <= new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000))
      .slice(0, 9);

    return this.grid({
      type: 'deadline_insights',
      title: 'Smart Deadline Agent',
      summary: riskTasks.length
        ? `${riskTasks.length} task cần chú ý trong 3 ngày tới hoặc đã trễ.`
        : 'Chưa thấy task nào có nguy cơ trễ rõ ràng.',
      cards: riskTasks.map((task) => ({
        id: task.taskId,
        title: task.title,
        subtitle: task.dueDate?.toISOString() || '',
        body: task.description || '',
        tone: task.dueDate && task.dueDate < now ? 'danger' : 'warning',
        icon: 'alert-triangle',
        meta: {
          status: task.status,
          priority: task.priority,
          assignees: task.assignees?.map((item) => item.user?.fullName).filter(Boolean) || [],
        },
      })),
      table: {
        columns: [
          { key: 'title', label: 'Task' },
          { key: 'status', label: 'Status' },
          { key: 'priority', label: 'Priority' },
          { key: 'dueDate', label: 'Deadline' },
        ],
        rows: riskTasks.map((task) => ({
          title: task.title,
          status: task.status,
          priority: task.priority,
          dueDate: task.dueDate?.toISOString() || null,
        })),
      },
      actions: [],
      meta: { taskCount: tasks.length, riskCount: riskTasks.length },
    });
  }

  private localSprintSummary(tasks: Task[], sprintName?: string) {
    const completed = tasks.filter((task) => task.status === TaskStatus.DONE);
    const blocked = tasks.filter((task) => /block|blocked|kẹt|vướng/i.test(task.description || ''));
    const active = tasks.filter((task) => task.status === TaskStatus.IN_PROGRESS);
    return this.grid({
      type: 'sprint_summary',
      title: sprintName || 'AI Sprint Summary',
      summary: `${completed.length}/${tasks.length} task đã hoàn thành. ${active.length} task đang xử lý, ${blocked.length} task có dấu hiệu blocker.`,
      cards: [
        {
          id: 'completed',
          title: 'Completed',
          body: String(completed.length),
          tone: 'positive',
          icon: 'check-circle-2',
        },
        {
          id: 'active',
          title: 'In progress',
          body: String(active.length),
          tone: 'info',
          icon: 'loader-circle',
        },
        {
          id: 'blocked',
          title: 'Blocked',
          body: String(blocked.length),
          tone: blocked.length ? 'warning' : 'neutral',
          icon: 'ban',
        },
      ],
      table: {
        columns: [
          { key: 'title', label: 'Task' },
          { key: 'status', label: 'Status' },
          { key: 'assignees', label: 'Assignees' },
        ],
        rows: tasks.slice(0, 12).map((task) => ({
          title: task.title,
          status: task.status,
          assignees:
            task.assignees?.map((item) => item.user?.fullName).filter(Boolean).join(', ') || '',
        })),
      },
      actions: [],
      meta: { taskCount: tasks.length, completed: completed.length, blocked: blocked.length },
    });
  }

  private localEmotion(text: string) {
    const lower = text.toLowerCase();
    const urgent = /gấp|urgent|asap|ngay|liền|deadline/.test(lower);
    const angry = /bực|tức|khó chịu|quá tệ|không chấp nhận|angry/.test(lower);
    const stress = /stress|áp lực|kẹt|vướng|trễ|không kịp/.test(lower);
    const label = angry ? 'angry' : urgent ? 'urgent' : stress ? 'stress' : 'neutral';
    return this.grid({
      type: 'emotion_detection',
      title: 'Smart Emotion Detection',
      summary:
        label === 'neutral'
          ? 'Tone tin nhắn khá trung tính.'
          : label === 'urgent'
            ? 'Tin nhắn này có dấu hiệu cần phản hồi gấp.'
            : label === 'angry'
              ? 'Tin nhắn này có tone khá tiêu cực.'
              : 'Tin nhắn này có dấu hiệu căng thẳng.',
      cards: [
        {
          id: 'emotion',
          title: label,
          body: this.truncate(text, 220),
          tone: label === 'neutral' ? 'neutral' : label === 'angry' ? 'danger' : 'warning',
          icon: label === 'urgent' ? 'alarm-clock' : label === 'angry' ? 'flame' : 'smile-plus',
          meta: { subtle: true, opacity: 0.55 },
        },
      ],
      actions: [],
      meta: { enabled: true, label },
    });
  }

  private localKnowledgeSearch(
    query: string,
    chunks: RagChunkScore[],
    workspaceContext: string[],
    memoryContext: string[],
  ) {
    const cards: AiCard[] = [
      ...chunks.map((chunk) => ({
        id: `rag_${chunk.documentId}_${chunk.chunkIndex}`,
        title: chunk.title,
        body: this.truncate(chunk.content, 260),
        tone: 'info' as AiCardTone,
        icon: 'search',
        meta: { documentId: chunk.documentId, score: chunk.score },
      })),
      ...workspaceContext.slice(0, 4).map((item, index) => ({
        id: `workspace_${index + 1}`,
        title: 'Workspace result',
        body: this.truncate(item, 260),
        tone: 'neutral' as AiCardTone,
        icon: 'file-text',
      })),
      ...memoryContext.slice(0, 4).map((item, index) => ({
        id: `memory_${index + 1}`,
        title: 'Personal memory',
        body: this.truncate(item, 260),
        tone: 'positive' as AiCardTone,
        icon: 'brain',
      })),
    ];

    return this.grid({
      type: 'knowledge_search',
      title: 'AI Knowledge Search',
      summary: cards.length
        ? `Tìm thấy ${cards.length} nguồn liên quan đến "${query}".`
        : 'Chưa tìm thấy nguồn phù hợp trong workspace/memory hiện có.',
      cards,
      actions: [],
      meta: {
        query,
        ragCount: chunks.length,
        workspaceHitCount: workspaceContext.length,
        memoryHitCount: memoryContext.length,
      },
    });
  }

  private summarizeWorkspaceLocally(question: string, tasks: Task[]) {
    const high = tasks.filter(
      (task) =>
        task.status !== TaskStatus.DONE &&
        (task.priority === Priority.HIGH || task.priority === Priority.URGENT),
    );
    if (/priority|ưu tiên|cao nhất/i.test(question)) {
      return high.length
        ? `Task priority cao nhất hiện tại là "${high[0].title}".`
        : 'Chưa thấy task priority cao đang mở.';
    }
    return `Workspace hiện có ${tasks.length} task trong phạm vi AI đọc được.`;
  }

  private formatMessages(messages: ChatMessageSnippet[]) {
    return messages
      .map(
        (message) =>
          `[${message.createdAt}] ${message.senderName}: ${message.content}`,
      )
      .join('\n');
  }

  private formatTasks(tasks: Task[]) {
    return tasks
      .map((task) => {
        const assignees =
          task.assignees?.map((item) => item.user?.fullName).filter(Boolean).join(', ') || 'Unassigned';
        return [
          `TASK ${task.taskId}`,
          `title=${task.title}`,
          `status=${task.status}`,
          `priority=${task.priority}`,
          `dueDate=${task.dueDate?.toISOString() || 'none'}`,
          `assignees=${assignees}`,
          `description=${task.description || ''}`,
        ].join(' | ');
      })
      .join('\n');
  }

  private formatRagChunks(chunks: RagChunkScore[]) {
    return chunks
      .map(
        (chunk) =>
          `[rag:${chunk.documentId}:${chunk.chunkIndex}:score=${chunk.score.toFixed(3)}] ${chunk.title}: ${chunk.content}`,
      )
      .join('\n');
  }

  private monthsAgo(months: number) {
    const date = new Date();
    date.setMonth(date.getMonth() - months);
    return date;
  }

  private truncate(text: string, max: number) {
    if (text.length <= max) {
      return text;
    }
    return `${text.slice(0, max - 3).trim()}...`;
  }

  private toTitle(text: string) {
    const normalized = text.replace(/\s+/g, ' ').trim();
    const cleaned = normalized
      .replace(/^(mai|hôm nay|ngày mai|please|pls|nhờ|hãy)\s+/i, '')
      .slice(0, 72)
      .trim();
    if (!cleaned) {
      return 'New AI Draft';
    }
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  private detectPriority(text: string): Priority {
    if (/urgent|gấp|asap|ngay|critical|blocker/i.test(text)) {
      return Priority.URGENT;
    }
    if (/deadline|trễ|risk|deploy|release/i.test(text)) {
      return Priority.HIGH;
    }
    return Priority.MEDIUM;
  }

  private detectRelativeDate(text: string) {
    const now = new Date();
    if (/ngày mai|mai|tomorrow/i.test(text)) {
      const tomorrow = new Date(now);
      tomorrow.setDate(now.getDate() + 1);
      tomorrow.setHours(9, 0, 0, 0);
      return tomorrow.toISOString();
    }
    if (/hôm nay|today/i.test(text)) {
      const today = new Date(now);
      today.setHours(Math.max(now.getHours() + 1, 9), 0, 0, 0);
      return today.toISOString();
    }
    if (/tuần sau|next week/i.test(text)) {
      const nextWeek = new Date(now);
      nextWeek.setDate(now.getDate() + 7);
      nextWeek.setHours(9, 0, 0, 0);
      return nextWeek.toISOString();
    }
    return null;
  }
}
