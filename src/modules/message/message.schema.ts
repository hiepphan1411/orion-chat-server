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
  isDelete: boolean;

  @Prop({ required: true })
  replyToMessageId: string;

  @Prop({ required: true })
  senderBy: string;

  @Prop({ required: true })
  conversationId: string;

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
