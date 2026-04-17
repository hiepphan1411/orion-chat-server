import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type NotificationDocument = Notification & Document;

@Schema({ timestamps: true })
export class Notification {
  // User 1 - N Notification
  @Prop({ required: true })
  userId!: string;

  @Prop({ required: true, default: 'system' })
  type!:
    | 'message'
    | 'call'
    | 'friend_request'
    | 'group_invite'
    | 'event_invite'
    | 'event_reminder'
    | 'system';

  @Prop()
  title!: string;

  @Prop()
  body!: string;

  @Prop({ type: Object, default: {} })
  metadata?: Record<string, any>;

  @Prop()
  link?: string;

  @Prop({ default: false })
  isRead!: boolean;

  @Prop()
  createdAt!: Date;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);
