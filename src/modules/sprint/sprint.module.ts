import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Sprint } from './entities/sprint.entity';
import { Workspace } from '../workspace/entities/workspace.entity';
import { Task } from '../task/entities/task.entity';
import { SprintService } from './sprint.service';
import { SprintController } from './sprint.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Sprint, Workspace, Task])],
  controllers: [SprintController],
  providers: [SprintService],
  exports: [SprintService],
})
export class SprintModule {}
