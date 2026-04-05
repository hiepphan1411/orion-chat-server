import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { MessageStatus } from 'src/common/enums/message-status.enum';
import { MessageType } from 'src/common/enums/message-type.enum';

export type MessageDocument = Message & Document;

@Schema({ timestamps: true })
export class Message {
  @Prop()
  content: string;

  @Prop()
  mediaUrl: string;

  @Prop()
  fileName: string;

  @Prop()
  fileSize: number;

  @Prop({ default: false })
  isPinned: boolean;

  @Prop({ default: false })
  isDeleted: boolean;

  @Prop({ type: [String], default: [] })
  deletedForUsers: string[];

  @Prop({ default: null })
  replyToMessageId?: string;

  @Prop({ default: null })
  forwardedFromMessageId?: string;

  @Prop({ required: true })
  senderBy: string;

  @Prop({ required: true })
  conversationId: string;

  @Prop()
  clientMessageId: string;

  @Prop({
    type: [
      {
        userId: { type: String },
        seenAt: { type: Date, default: Date.now },
      },
    ],
    default: [],
  })
  seenBy: Array<{ userId: string; seenAt: Date }>;

  @Prop({
    type: [
      {
        userId: { type: String, required: true },
        emoji: { type: String, required: true },
        reactedAt: { type: Date, default: Date.now },
      },
    ],
    default: [],
  })
  reactions: Array<{ userId: string; emoji: string; reactedAt: Date }>;

  @Prop({
    type: String,
    enum: MessageType,
    default: MessageType.TEXT,
  })
  messageType: MessageType;

  @Prop({
    type: String,
    enum: MessageStatus,
    default: MessageStatus.SENT,
  })
  messageStatus: MessageStatus;
}

export const MessageSchema = SchemaFactory.createForClass(Message);
MessageSchema.index({ conversationId: 1, createdAt: -1 });
MessageSchema.index({ conversationId: 1, senderBy: 1, clientMessageId: 1 });
