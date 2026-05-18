import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  AIChatSession,
  AIChatSessionDocument,
} from './ai-chat-sesstion.schema';
import { AIMessageService } from '../ai-message/ai-message.service';
import { AIMessageRole } from 'src/common/enums/ai-message-role.enum';
import { AIRagService } from '../ai-rag/ai-rag.service';
import type { AIActionSuggestion } from '../ai-actions/ai-action.types';
import axios from 'axios';

interface GeminiInlineAttachment {
  mimeType: string;
  data: string;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
  usageMetadata?: {
    totalTokenCount?: number;
  };
}

type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

@Injectable()
export class AIChatSessionService {
  constructor(
    @InjectModel(AIChatSession.name)
    private sessionModel: Model<AIChatSessionDocument>,
    private readonly messageService: AIMessageService,
    private readonly aiRagService: AIRagService,
    private readonly configService: ConfigService,
  ) {}

  async createSession(
    userId: string,
    aiModel: string,
    systemPrompt?: string,
    title?: string,
  ): Promise<AIChatSession> {
    const session = new this.sessionModel({
      userId,
      aiModel,
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
    return this.sessionModel
      .findByIdAndUpdate(sessionId, update, { returnDocument: 'after' })
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
    attachment?: GeminiInlineAttachment,
  ): Promise<{
    assistantMessage: string;
    tokenUsed?: number;
    suggestedActions?: AIActionSuggestion[];
  }> {
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
    const contents: Array<{ role: 'user' | 'model'; parts: GeminiPart[] }> =
      messages.map((item) => ({
        role: item.aiMessageRole === AIMessageRole.USER ? 'user' : 'model',
        parts: [{ text: item.content }],
      }));

    if (attachment) {
      const lastContent = contents[contents.length - 1];
      if (lastContent) {
        if (isAudioAttachment && isVoicePlaceholder) {
          lastContent.parts[0] = {
            text: 'Analyze the attached audio, infer the user intent, and answer directly in Vietnamese. Do not repeat or quote the transcript unless the user explicitly asks for transcription.',
          };
        }

        lastContent.parts.push({
          inlineData: {
            mimeType: attachment.mimeType,
            data: attachment.data,
          },
        });
      }
    }

    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      throw new InternalServerErrorException(
        'Missing GEMINI_API_KEY on server',
      );
    }

    const model = session.aiModel || 'gemini-2.5-flash';
    const systemPrompt =
      session.systemPrompt ||
      'You are a premium AI assistant. Be concise, practical, and reliable.';

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

    const effectiveSystemPrompt = ragContext
      ? `${systemPrompt}\n\nUse the CONTEXT below as your primary factual source. If the answer is not in context, say you are not sure.\n\nCONTEXT:\n${ragContext}`
      : systemPrompt;

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    try {
      const response = await axios.post<GeminiResponse>(endpoint, {
        systemInstruction: {
          parts: [{ text: effectiveSystemPrompt }],
        },
        contents,
        generationConfig: {
          temperature: 0.7,
        },
      });

      const candidateParts = response.data.candidates?.[0]?.content?.parts;
      const responseText = candidateParts
        ?.map((part) => part.text ?? '')
        .join('')
        .trim();
      const assistantMessage =
        responseText && responseText.length > 0
          ? responseText
          : 'Xin lỗi, mình chưa tạo được phản hồi lúc này.';

      const tokenUsed = response.data.usageMetadata?.totalTokenCount;

      const suggestedActions = await this.generateSuggestedActions({
        model,
        apiKey,
        systemPrompt,
        messages,
        latestUserMessage: trimmed,
      });

      await this.messageService.createMessage(
        sessionId,
        assistantMessage,
        AIMessageRole.ASSISTANT,
        tokenUsed,
      );

      await this.sessionModel
        .findByIdAndUpdate(sessionId, { updatedAt: new Date() })
        .exec();

      return { assistantMessage, tokenUsed, suggestedActions };
    } catch (error) {
      throw new InternalServerErrorException(
        `Gemini request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
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

  private async generateSuggestedActions(params: {
    model: string;
    apiKey: string;
    systemPrompt: string;
    messages: Array<{ content: string; aiMessageRole: AIMessageRole }>;
    latestUserMessage: string;
  }): Promise<AIActionSuggestion[]> {
    if (!params.latestUserMessage) return [];

    const recentMessages = params.messages
      .slice(-8)
      .map((item) =>
        `${item.aiMessageRole === AIMessageRole.USER ? 'USER' : 'ASSISTANT'}: ${item.content}`
          .trim(),
      )
      .join('\n');

    const actionSystemPrompt =
      'You are an action planner for a workspace + chat system. ' +
      'Your job is to propose up to 3 helpful actions based on the conversation. ' +
      'Return STRICT JSON only, no markdown. ' +
      'Schema: {"actions":[{"id":"string","type":"create_task|summarize_unread|schedule_meeting|update_task|set_priority|follow_up","title":"string","description":"string","payload":{},"requiresApproval":true,"requiredFields":[]}]}.' +
      'If an action needs more info (workspaceId, boardId, dates, assigneeIds), list them in requiredFields. ' +
      'If no clear actions, return {"actions":[]}.';

    const actionPrompt =
      `System context: ${params.systemPrompt}\n\n` +
      `Conversation:\n${recentMessages}\n\n` +
      `Latest user message:\n${params.latestUserMessage}\n\n` +
      'Propose actions now.';

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${params.model}:generateContent?key=${params.apiKey}`;

    try {
      const response = await axios.post<GeminiResponse>(endpoint, {
        systemInstruction: {
          parts: [{ text: actionSystemPrompt }],
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: actionPrompt }],
          },
        ],
        generationConfig: {
          temperature: 0.2,
        },
      });

      const responseText = response.data.candidates?.[0]?.content?.parts
        ?.map((part) => part.text ?? '')
        .join('')
        .trim();

      if (!responseText) return [];

      const jsonPayload = this.extractJsonPayload(responseText);
      if (!jsonPayload) return [];

      const parsed = JSON.parse(jsonPayload) as { actions?: AIActionSuggestion[] };
      if (!parsed || !Array.isArray(parsed.actions)) return [];

      return this.normalizeSuggestedActions(parsed.actions);
    } catch (error) {
      console.warn('AI suggested actions generation failed:', error);
      return [];
    }
  }

  private extractJsonPayload(text: string): string | null {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return null;
    return text.slice(start, end + 1);
  }

  private normalizeSuggestedActions(
    actions: AIActionSuggestion[],
  ): AIActionSuggestion[] {
    const allowedTypes = new Set([
      'create_task',
      'summarize_unread',
      'schedule_meeting',
      'update_task',
      'set_priority',
      'follow_up',
    ]);

    return actions
      .filter((action) => action && allowedTypes.has(action.type))
      .slice(0, 3)
      .map((action, index) => ({
        id: action.id || `action-${Date.now()}-${index}`,
        type: action.type,
        title: action.title || 'Suggested action',
        description: action.description || '',
        payload: action.payload ?? {},
        requiresApproval: true,
        requiredFields: Array.isArray(action.requiredFields)
          ? action.requiredFields
          : [],
      }));
  }
}
