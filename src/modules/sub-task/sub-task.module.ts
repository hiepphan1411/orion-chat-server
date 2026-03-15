import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SubTask } from './entities/sub-task.entity';
import { Task } from '../task/entities/task.entity';
import { User } from '../users/entities/user.entity';
import { SubTaskService } from './sub-task.service';
import { SubTaskController } from './sub-task.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SubTask, Task, User])],
  controllers: [SubTaskController],
  providers: [SubTaskService],
})
export class SubTaskModule {}
