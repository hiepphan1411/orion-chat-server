import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

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
}
