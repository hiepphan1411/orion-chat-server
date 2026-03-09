/* eslint-disable */
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { Notification } from './notification.schema';

@Injectable()
export class NotificationService {
  constructor(
    @InjectModel(Notification.name)
    private model: Model<Notification>,
  ) {}

  create(data: any) {
    return this.model.create(data);
  }

  findAll() {
    return this.model.find();
  }

  findByUser(userId: string) {
    return this.model.find({ userId });
  }

  markAsRead(id: string) {
    return this.model.findByIdAndUpdate(id, { isRead: true });
  }

  delete(id: string) {
    return this.model.findByIdAndDelete(id);
  }
}
