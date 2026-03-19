import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AIRagChunkDocument = AIRagChunk & Document;

@Schema({ timestamps: true })
export class AIRagChunk {
  @Prop({ required: true })
  userId: string;

  @Prop({ required: true })
  documentId: string;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  content: string;

  @Prop({ required: true })
  chunkIndex: number;

  @Prop({ type: [Number], required: true })
  embedding: number[];

  @Prop({ type: [String], default: [] })
  tags: string[];
}

export const AIRagChunkSchema = SchemaFactory.createForClass(AIRagChunk);

AIRagChunkSchema.index(
  { userId: 1, documentId: 1, chunkIndex: 1 },
  { unique: true },
);
AIRagChunkSchema.index({ userId: 1, updatedAt: -1 });
