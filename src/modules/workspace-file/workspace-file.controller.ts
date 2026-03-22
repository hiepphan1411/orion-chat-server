import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Delete,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { WorkspaceFileService } from './workspace-file.service';
import { CreateWorkspaceFileDto } from './dto/create-workspace-file.dto';
import { UpdateWorkspaceFileDto } from './dto/update-workspace-file.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';

@Controller()
@UseGuards(JwtAuthGuard)
export class WorkspaceFileController {
  constructor(private readonly workspaceFileService: WorkspaceFileService) {}

  @Post('workspaces/:workspaceId/files')
  createFile(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: CreateWorkspaceFileDto,
    @Req() req: any,
  ) {
    const userId = req.user.userId;
    return this.workspaceFileService.create(workspaceId, dto, userId);
  }

  @Post('workspaces/:workspaceId/folders')
  createFolder(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: CreateWorkspaceFileDto,
    @Req() req: any,
  ) {
    const userId = req.user.userId;
    return this.workspaceFileService.createFolder(workspaceId, dto, userId);
  }

  @Get('workspaces/:workspaceId/files')
  findByWorkspace(
    @Param('workspaceId') workspaceId: string,
    @Query('parentId') parentId?: string,
  ) {
    return this.workspaceFileService.findByWorkspace(workspaceId, parentId);
  }

  @Patch('workspace-files/:id')
  update(@Param('id') id: string, @Body() dto: UpdateWorkspaceFileDto) {
    return this.workspaceFileService.update(id, dto);
  }

  @Delete('workspace-files/:id')
  remove(@Param('id') id: string) {
    return this.workspaceFileService.remove(id);
  }
}
