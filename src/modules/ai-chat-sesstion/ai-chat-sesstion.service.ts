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
  | { inline_data: { mime_type: string; data: string } };

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
  ): Promise<{ assistantMessage: string; tokenUsed?: number }> {
    const trimmed = message.trim();
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
        lastContent.parts.push({
          inline_data: {
            mime_type: attachment.mimeType,
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

    const ragChunks = await this.aiRagService.retrieveRelevantChunks(
      userId,
      trimmed,
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

      await this.messageService.createMessage(
        sessionId,
        assistantMessage,
        AIMessageRole.ASSISTANT,
        tokenUsed,
      );

      await this.sessionModel
        .findByIdAndUpdate(sessionId, { updatedAt: new Date() })
        .exec();

      return { assistantMessage, tokenUsed };
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
}
