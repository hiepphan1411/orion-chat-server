import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AIRagDocumentDocument = AIRagDocument & Document;

@Schema({ timestamps: true })
export class AIRagDocument {
  @Prop({ required: true })
  userId: string;

  @Prop({ required: true })
  documentId: string;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  content: string;

  @Prop({ type: [String], default: [] })
  tags: string[];
}

export const AIRagDocumentSchema = SchemaFactory.createForClass(AIRagDocument);

AIRagDocumentSchema.index({ userId: 1, documentId: 1 }, { unique: true });
AIRagDocumentSchema.index({ userId: 1, updatedAt: -1 });
