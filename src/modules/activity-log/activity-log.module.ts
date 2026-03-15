import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivityLog } from './entities/activity-log.entity';
import { Task } from '../task/entities/task.entity';
import { User } from '../users/entities/user.entity';
import { ActivityLogService } from './activity-log.service';
import { ActivityLogController } from './activity-log.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ActivityLog, Task, User])],
  controllers: [ActivityLogController],
  providers: [ActivityLogService],
})
export class ActivityLogModule {}
