import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Goal } from './entities/goal.entity';
import { KeyResult } from './entities/key-result.entity';
import { Workspace } from '../workspace/entities/workspace.entity';
import { User } from '../users/entities/user.entity';
import { GoalService } from './goal.service';
import { GoalController } from './goal.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Goal, KeyResult, Workspace, User])],
  controllers: [GoalController],
  providers: [GoalService],
  exports: [GoalService],
})
export class GoalModule {}
