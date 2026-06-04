import {
  BadRequestException,
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
  UploadedFile,
  UseInterceptors,
  HttpCode,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { WorkspaceFileService } from './workspace-file.service';
import { CreateWorkspaceFileDto } from './dto/create-workspace-file.dto';
import { UpdateWorkspaceFileDto } from './dto/update-workspace-file.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';

@Controller()
@UseGuards(JwtAuthGuard)
export class WorkspaceFileController {
  constructor(private readonly workspaceFileService: WorkspaceFileService) {}

  @Post('workspaces/:workspaceId/files')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 50 * 1024 * 1024 },
    }),
  )
  createFile(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: CreateWorkspaceFileDto,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: any,
  ) {
    const userId = req.user.userId;
    if (!file && !dto.url && !dto.name) {
      throw new BadRequestException('Provide either a file, url, or name');
    }
    return this.workspaceFileService.create(workspaceId, dto, userId, file);
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

  @Get('workspace-files/:id/onlyoffice/config')
  getOnlyOfficeConfig(@Param('id') id: string, @Req() req: any) {
    return this.workspaceFileService.getOnlyOfficeConfig(id, req.user.userId);
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


@Controller()
export class WorkspaceFileOnlyOfficeCallbackController {
  constructor(private readonly workspaceFileService: WorkspaceFileService) {}

  @Post('workspace-files/:id/onlyoffice/callback')
  @HttpCode(200)
  handleOnlyOfficeCallback(
    @Param('id') id: string,
    @Query('token') token: string | undefined,
    @Body() body: any,
  ) {
    return this.workspaceFileService.handleOnlyOfficeCallback(id, token, body);
  }
}
