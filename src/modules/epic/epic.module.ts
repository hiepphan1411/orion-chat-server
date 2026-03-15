import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Epic } from './entities/epic.entity';
import { Workspace } from '../workspace/entities/workspace.entity';
import { User } from '../users/entities/user.entity';
import { TaskBoard } from '../task-board/entities/task-board.entity';
import { EpicService } from './epic.service';
import { EpicController } from './epic.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Epic, Workspace, User, TaskBoard])],
  controllers: [EpicController],
  providers: [EpicService],
  exports: [EpicService],
})
export class EpicModule {}
