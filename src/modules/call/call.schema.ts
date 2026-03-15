/* eslint-disable */
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { CallType } from 'src/common/enums/call-type.enum';

export type CallDocument = Call & Document;

@Schema({ timestamps: true })
export class Call {
  // MongoDB sẽ tự động tạo _id, không cần callId riêng
  // Nếu muốn dùng _id: call._id.toString()

  // Conversation 1 - N Call
  @Prop({ required: true })
  conversationId: string;

  @Prop()
  startTime: Date;

  @Prop()
  endTime: Date;

  @Prop()
  callType: CallType;
}

export const CallSchema = SchemaFactory.createForClass(Call);
