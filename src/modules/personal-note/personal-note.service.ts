import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PersonalNote } from './personal-note.schema';

@Injectable()
export class PersonalNoteService {
  constructor(
    @InjectModel(PersonalNote.name)
    private model: Model<PersonalNote>,
  ) {}

  create(data: any) {
    return this.model.create(data);
  }

  findAll() {
    return this.model.find();
  }

  findByUser(userId: string) {
    return this.model.find({ userId });
  }

  markAsRead(id: string) {
    return this.model.findByIdAndUpdate(id, { isRead: true });
  }

  delete(id: string) {
    return this.model.findByIdAndDelete(id);
  }
}
