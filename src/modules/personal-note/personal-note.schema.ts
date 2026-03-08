import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PersonalNoteDocument = PersonalNote & Document;

@Schema({ timestamps: true })
export class PersonalNote {
  // User 1 - N PersonalNote
  @Prop()
  userId: string;

  @Prop()
  content: string;

  @Prop()
  updatedAt: Date;
}

export const PersonalNoteSchema = SchemaFactory.createForClass(PersonalNote);
