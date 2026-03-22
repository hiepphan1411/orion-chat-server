import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Milestone } from './entities/milestone.entity';
import { Workspace } from '../workspace/entities/workspace.entity';
import { MilestoneService } from './milestone.service';
import { MilestoneController } from './milestone.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Milestone, Workspace])],
  controllers: [MilestoneController],
  providers: [MilestoneService],
  exports: [MilestoneService],
})
export class MilestoneModule {}
