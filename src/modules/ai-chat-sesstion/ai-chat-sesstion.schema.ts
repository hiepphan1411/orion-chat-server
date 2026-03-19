import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AIChatSessionDocument = AIChatSession & Document;

@Schema({ timestamps: true })
export class AIChatSession {
  @Prop()
  sessionId?: string;

  @Prop({ required: true })
  userId: string; // id từ PostgreSQL

  @Prop({ default: 'New Conversation' })
  title: string;

  @Prop({ required: true })
  aiModel: string;

  @Prop()
  systemPrompt: string;
}

export const AIChatSessionSchema = SchemaFactory.createForClass(AIChatSession);
