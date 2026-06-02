import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkspaceFile } from './entities/workspace-file.entity';
import { WorkspaceFileVersion } from './entities/workspace-file-version.entity';
import { Workspace } from '../workspace/entities/workspace.entity';
import { User } from '../users/entities/user.entity';
import { WorkspaceFileService } from './workspace-file.service';
import {
  WorkspaceFileController,
  WorkspaceFileOnlyOfficeCallbackController,
} from './workspace-file.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([WorkspaceFile, WorkspaceFileVersion, Workspace, User]),
  ],
  controllers: [WorkspaceFileController, WorkspaceFileOnlyOfficeCallbackController],
  providers: [WorkspaceFileService],
})
export class WorkspaceFileModule {}
