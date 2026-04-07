import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { MessageStatus } from 'src/common/enums/message-status.enum';
import { MessageType } from 'src/common/enums/message-type.enum';

export type MessageDocument = Message & Document;

@Schema({ timestamps: true })
export class Message {
  @Prop()
  content: string | undefined;

  @Prop()
  mediaUrl: string | undefined;

  @Prop()
  fileName: string | undefined;

  @Prop()
  fileSize: number | undefined;

  @Prop({ default: false })
  isPinned: boolean | undefined;

  @Prop({ default: false })
  isDeleted: boolean | undefined;

  @Prop({ type: [String], default: [] })
  deletedForUsers: string[] | undefined;

  @Prop({ default: null })
  replyToMessageId?: string;

  @Prop({ default: null })
  forwardedFromMessageId?: string;

  @Prop({ required: true })
  senderBy: string | undefined;

  @Prop({ required: true })
  conversationId: string | undefined;

  @Prop()
  clientMessageId: string | undefined;

  @Prop({
    type: [
      {
        userId: { type: String },
        seenAt: { type: Date, default: Date.now },
      },
    ],
    default: [],
  })
  seenBy: Array<{ userId: string; seenAt: Date }> | undefined;

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
  reactions:
    | Array<{ userId: string; emoji: string; reactedAt: Date }>
    | undefined;

  @Prop({
    type: String,
    enum: MessageType,
    default: MessageType.TEXT,
  })
  messageType: MessageType | undefined;

  @Prop({
    type: String,
    enum: MessageStatus,
    default: MessageStatus.SENT,
  })
  messageStatus: MessageStatus | undefined;

  @Prop({ type: Date, default: () => new Date() })
  createdAt: Date | undefined;

  @Prop({ type: Date, default: () => new Date() })
  updatedAt: Date | undefined;
}

export const MessageSchema = SchemaFactory.createForClass(Message);
MessageSchema.index({ conversationId: 1, createdAt: -1 });
MessageSchema.index({ conversationId: 1, senderBy: 1, clientMessageId: 1 });
