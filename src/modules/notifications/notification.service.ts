import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { Notification } from './notification.schema';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectModel(Notification.name)
    private notificationModel: Model<Notification>,
  ) {}

  async create(userId: number, message: string) {
    return this.notificationModel.create({
      userId,
      message,
      isRead: false,
    });
  }

  async findByUser(userId: number) {
    return this.notificationModel.find({ userId });
  }
}
