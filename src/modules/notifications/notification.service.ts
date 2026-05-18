import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import axios from 'axios';

import { Notification } from './notification.schema';
import { NotificationGateway } from './notification.gateway';

export type NotificationType =
  | 'message'
  | 'call'
  | 'friend_request'
  | 'group_invite'
  | 'event_invite'
  | 'event_reminder'
  | 'system'
  | 'group_join_approved'
  | 'group_join_rejected'
  | 'group_promoted'
  | 'group_removed'
  | 'group_dissolved'
  | 'group_join_request';

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  metadata?: Record<string, any>;
  link?: string;
  isRead?: boolean;
}

@Injectable()
export class NotificationService {
  constructor(
    @InjectModel(Notification.name)
    private model: Model<Notification>,
    private readonly notificationGateway: NotificationGateway,
    private readonly configService: ConfigService,
  ) {}

  async create(data: CreateNotificationInput) {
    return this.model.create({
      ...data,
      isRead: data.isRead ?? false,
    });
  }

  async createAndEmit(data: CreateNotificationInput) {
    const created = await this.create(data);
    this.notificationGateway.emitToUser(
      data.userId,
      'notifications:new',
      created,
    );
    this.notificationGateway.emitUnreadCount(data.userId);
    return created;
  }

  async findAll() {
    return this.model.find().sort({ createdAt: -1 });
  }

  async findByUser(userId: string, limit = 20, skip = 0) {
    const [items, total] = await Promise.all([
      this.model
        .find({ userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      this.model.countDocuments({ userId }),
    ]);

    return { items, total, limit, skip };
  }

  async countUnread(userId: string) {
    const count = await this.model.countDocuments({ userId, isRead: false });
    return { count };
  }

  async markAsRead(id: string, userId: string) {
    const updated = await this.model.findOneAndUpdate(
      { _id: id, userId },
      { isRead: true },
      { new: true },
    );

    if (!updated) {
      throw new NotFoundException('Notification not found');
    }

    this.notificationGateway.emitToUser(
      userId,
      'notifications:updated',
      updated,
    );
    this.notificationGateway.emitUnreadCount(userId);
    return updated;
  }

  async markAllAsRead(userId: string) {
    await this.model.updateMany({ userId, isRead: false }, { isRead: true });
    this.notificationGateway.emitToUser(userId, 'notifications:all_read', {
      userId,
      at: new Date().toISOString(),
    });
    this.notificationGateway.emitUnreadCount(userId);
    return { success: true };
  }

  async delete(id: string, userId: string) {
    const deleted = await this.model.findOneAndDelete({ _id: id, userId });
    if (!deleted) {
      throw new NotFoundException('Notification not found');
    }

    this.notificationGateway.emitUnreadCount(userId);
    return { success: true };
  }

  async buildDigest(
    userId: string,
    options?: {
      sinceHours?: number;
      includeRead?: boolean;
      useAI?: boolean;
      maxItems?: number;
    },
  ) {
    const sinceHours = options?.sinceHours ?? 24;
    const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000);
    const query: Record<string, unknown> = {
      userId,
      createdAt: { $gte: since },
    };

    if (!options?.includeRead) {
      query.isRead = false;
    }

    const items = await this.model
      .find(query)
      .sort({ createdAt: -1 })
      .limit(options?.maxItems ?? 40)
      .lean()
      .exec();

    const counts = items.reduce<Record<string, number>>((acc, item) => {
      const type = item.type || 'system';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {});

    let summary = this.buildFallbackSummary(counts, items.length, sinceHours);
    if (options?.useAI) {
      const aiSummary = await this.buildGeminiSummary(items, sinceHours);
      if (aiSummary) summary = aiSummary;
    }

    return {
      summary,
      counts,
      items,
      window: {
        since: since.toISOString(),
        until: new Date().toISOString(),
      },
    };
  }

  private buildFallbackSummary(
    counts: Record<string, number>,
    total: number,
    sinceHours: number,
  ): string {
    if (total === 0) {
      return `No unread notifications in the last ${sinceHours} hours.`;
    }

    const parts = Object.entries(counts)
      .map(([type, count]) => `${count} ${type}`)
      .join(', ');

    return `You have ${total} unread notifications in the last ${sinceHours} hours: ${parts}.`;
  }

  private async buildGeminiSummary(
    items: Array<{ type?: string; title?: string; body?: string }>,
    sinceHours: number,
  ): Promise<string | null> {
    if (items.length === 0) return null;

    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (!apiKey) return null;

    const model = 'gemini-2.5-flash';
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const lines = items
      .slice(0, 30)
      .map(
        (item, index) =>
          `${index + 1}. [${item.type || 'system'}] ${item.title || 'Notification'} - ${item.body || ''}`
            .trim(),
      )
      .join('\n');

    const systemPrompt =
      'You summarize notification digests for a chat/workspace app. ' +
      'Write in Vietnamese, 3-5 bullet points, highlight urgent or action-needed items. ' +
      'If nothing urgent, say it briefly.';

    try {
      const response = await axios.post<{
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      }>(endpoint, {
        systemInstruction: {
          parts: [{ text: systemPrompt }],
        },
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `Digest window: last ${sinceHours} hours. Notifications:\n${lines}`,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.2,
        },
      });

      const text = response.data.candidates?.[0]?.content?.parts
        ?.map((part) => part.text || '')
        .join('')
        .trim();

      return text || null;
    } catch (error) {
      console.warn('Failed to build Gemini digest summary:', error);
      return null;
    }
  }
}
