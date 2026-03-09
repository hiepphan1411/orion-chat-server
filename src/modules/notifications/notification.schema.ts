/* eslint-disable */
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type NotificationDocument = Notification & Document;

@Schema({ timestamps: true })
export class Notification {
  // User 1 - N Notification
  @Prop({ required: true })
  userId: string;

  @Prop()
  title: string;

  @Prop()
  body: string;

  @Prop({ default: false })
  isRead: boolean;

  @Prop()
  createdAt: Date;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);
