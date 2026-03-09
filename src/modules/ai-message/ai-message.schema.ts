import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { AIMessageRole } from 'src/common/enums/ai-message-role.enum';

export type AIMessageDocument = AIMessage & Document;

@Schema({ timestamps: true })
export class AIMessage {
  @Prop({ type: Types.ObjectId, ref: 'AIChatSession', required: true })
  sessionId: Types.ObjectId;

  @Prop({ required: true })
  content: string;

  @Prop()
  tokenUsed: number;

  @Prop({ enum: AIMessageRole, required: true })
  aiMessageRole: AIMessageRole;
}

export const AIMessageSchema = SchemaFactory.createForClass(AIMessage);
