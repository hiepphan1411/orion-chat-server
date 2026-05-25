import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { Notification } from './notification.schema';
import { NotificationGateway } from './notification.gateway';
import { NotificationSettingsService } from '../notification-settings/notification-settings.service';
import type { NotificationSettings } from '../notification-settings/entities/notification-settings.entity';

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
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @InjectModel(Notification.name)
    private model: Model<Notification>,
    private readonly notificationGateway: NotificationGateway,
    private readonly notificationSettingsService: NotificationSettingsService,
  ) {}

  private shouldDeliver(
    settings: NotificationSettings,
    type: NotificationType,
    metadata?: Record<string, any>,
  ): boolean {
    if (settings.muteAll === true) return false;

    switch (type) {
      case 'message': {
        const isGroup =
          metadata?.conversationType === 'GROUP' || !!metadata?.groupId;

        if (settings.messageNotifications === false) return false;

        if (isGroup) {
          // Tag override: tagged messages bypass groupNotifications if tagNotifications is on.
          // Requires metadata.isTagged=true set by the caller (chat.gateway).
          if (metadata?.isTagged === true) {
            return settings.tagNotifications !== false;
          }
          return settings.groupNotifications !== false;
        }
        return true;
      }
      case 'call':
        return settings.callNotifications !== false;
      case 'friend_request':
        return settings.friendRequestNotifications !== false;
      case 'group_invite':
      case 'group_join_approved':
      case 'group_join_rejected':
      case 'group_promoted':
      case 'group_removed':
      case 'group_dissolved':
      case 'group_join_request':
        return settings.groupNotifications !== false;
      // Calendar and system notifications always deliver regardless of settings
      case 'event_invite':
      case 'event_reminder':
      case 'system':
      default:
        return true;
    }
  }

  async create(data: CreateNotificationInput) {
    return this.model.create({
      ...data,
      isRead: data.isRead ?? false,
    });
  }

  async createAndEmit(data: CreateNotificationInput): Promise<Notification | null> {
    // Check settings BEFORE persisting — disabled types are fully suppressed (no DB save, no emit)
    let shouldDeliver = true;
    try {
      const settings = await this.notificationSettingsService.findByUserId(data.userId);
      shouldDeliver = this.shouldDeliver(settings, data.type, data.metadata);
      this.logger.log(
        `[createAndEmit] userId=${data.userId} type=${data.type} shouldDeliver=${shouldDeliver} settings=${JSON.stringify({
          muteAll: settings.muteAll,
          messageNotifications: settings.messageNotifications,
          groupNotifications: settings.groupNotifications,
          tagNotifications: settings.tagNotifications,
          callNotifications: settings.callNotifications,
          friendRequestNotifications: settings.friendRequestNotifications,
        })} metadata=${JSON.stringify(data.metadata || {})}`,
      );
    } catch (err) {
      this.logger.warn(
        `[createAndEmit] Settings lookup failed for userId=${data.userId}, defaulting to deliver. err=${err}`,
      );
    }

    if (!shouldDeliver) {
      this.logger.log(
        `[createAndEmit] Suppressed (settings disabled) for userId=${data.userId} type=${data.type}`,
      );
      return null;
    }

    const created = await this.create(data);
    this.logger.log(
      `[createAndEmit] Saved to MongoDB id=${created._id} for userId=${data.userId}`,
    );

    this.notificationGateway.emitToUser(data.userId, 'notifications:new', created);
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
}
