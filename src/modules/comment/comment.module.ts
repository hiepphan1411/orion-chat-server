import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Comment } from './entities/comment.entity';
import { Task } from '../task/entities/task.entity';
import { User } from '../users/entities/user.entity';
import { CommentService } from './comment.service';
import { CommentController } from './comment.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Comment, Task, User])],
  controllers: [CommentController],
  providers: [CommentService],
})
export class CommentModule {}
