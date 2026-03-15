import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkspaceFile } from './entities/workspace-file.entity';
import { Workspace } from '../workspace/entities/workspace.entity';
import { User } from '../users/entities/user.entity';
import { WorkspaceFileService } from './workspace-file.service';
import { WorkspaceFileController } from './workspace-file.controller';

@Module({
  imports: [TypeOrmModule.forFeature([WorkspaceFile, Workspace, User])],
  controllers: [WorkspaceFileController],
  providers: [WorkspaceFileService],
})
export class WorkspaceFileModule {}
