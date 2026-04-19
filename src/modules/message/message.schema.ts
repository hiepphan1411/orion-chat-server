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

  @Prop()
  mimeType?: string;

  @Prop()
  fileExtension?: string;

  @Prop()
  fileCategory?: string;

  @Prop()
  fileIcon?: string;

  @Prop({ default: false })
  isPinned: boolean;

  @Prop({ default: false })
  isDeleted: boolean;

  @Prop({ type: [String], default: [] })
  deletedForUsers: string[];

  @Prop({ default: false })
  isRevoked: boolean;

  @Prop({ default: false })
  deletedByAdmin: boolean;

  @Prop({ default: null })
  adminDeletedBy?: string;

  @Prop({ default: null })
  adminDeletedAt?: Date;

  @Prop({ default: null })
  revokedBy?: string;

  @Prop({ default: null })
  revokedAt?: Date;

  @Prop({ default: null })
  replyToMessageId?: string;

  @Prop({ default: null })
  forwardedFromMessageId?: string;

  @Prop({ required: true })
  // NOTE: senderBy must ALWAYS be userId (UUID), NEVER phoneNumber
  // This is used to match against User.userId in PostgreSQL
  // Frontend: Use senderBy === currentUser.userId to determine message ownership
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
    type: {
      callType: {
        type: String,
        enum: ['audio', 'video'],
      },
      callStatus: {
        type: String,
        enum: ['completed', 'missed', 'declined'],
      },
      duration: { type: Number },
      isInitiator: { type: Boolean },
      wasRejected: { type: Boolean },
    },
    default: null,
  })
  callData?: {
    callType?: 'audio' | 'video';
    callStatus?: 'completed' | 'missed' | 'declined';
    duration?: number;
    isInitiator?: boolean;
    wasRejected?: boolean;
  } | null;

  @Prop({
    type: String,
    enum: MessageStatus,
    default: MessageStatus.SENT,
  })
  messageStatus: MessageStatus;

  @Prop({ type: Date, default: () => new Date() })
  createdAt: Date;

  @Prop({ type: Date, default: () => new Date() })
  updatedAt: Date;
}

export const MessageSchema = SchemaFactory.createForClass(Message);
MessageSchema.index({ conversationId: 1, createdAt: -1 });
MessageSchema.index({ conversationId: 1, senderBy: 1, clientMessageId: 1 });
