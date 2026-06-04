import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import { WorkspaceService } from './workspace.service';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { CurrentUserPayload } from 'src/common/decorators/current-user.decorator';

@Controller('workspaces')
@UseGuards(JwtAuthGuard)
export class WorkspaceController {
  constructor(private readonly workspaceService: WorkspaceService) {}

  @Post()
  create(@Body() dto: CreateWorkspaceDto) {
    return this.workspaceService.create(dto);
  }

  @Get()
  findAll(@Query('userId') userId: string) {
    return this.workspaceService.findAllForUser(userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.workspaceService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateWorkspaceDto) {
    return this.workspaceService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.workspaceService.remove(id, user.userId);
  }

  @Patch(':id/transfer-owner/:targetUserId')
  transferOwner(
    @Param('id') id: string,
    @Param('targetUserId') targetUserId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.workspaceService.transferOwner(id, targetUserId, user.userId);
  }

  @Get(':id/workload')
  getWorkload(@Param('id') id: string) {
    return this.workspaceService.getWorkload(id);
  }

  @Get(':id/dashboard-stats')
  getDashboardStats(@Param('id') id: string) {
    return this.workspaceService.getDashboardStats(id);
  }

  @Get(':id/reports')
  getReports(@Param('id') id: string) {
    return this.workspaceService.getReports(id);
  }

  @Post(':id/invite-link')
  generateInviteLink(@Param('id') id: string) {
    return this.workspaceService.generateInviteLink(id);
  }
}
