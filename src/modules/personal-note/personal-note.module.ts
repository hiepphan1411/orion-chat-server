import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PersonalNote, PersonalNoteSchema } from './personal-note.schema';
import { PersonalNoteService } from './personal-note.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PersonalNote.name, schema: PersonalNoteSchema },
    ]),
  ],
  providers: [PersonalNoteService],
})
export class PersonalNoteModule {}
