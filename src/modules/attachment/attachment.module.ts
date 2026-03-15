import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Attachment } from './entities/attachment.entity';
import { Task } from '../task/entities/task.entity';
import { User } from '../users/entities/user.entity';
import { AttachmentService } from './attachment.service';
import { AttachmentController } from './attachment.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Attachment, Task, User])],
  controllers: [AttachmentController],
  providers: [AttachmentService],
})
export class AttachmentModule {}
