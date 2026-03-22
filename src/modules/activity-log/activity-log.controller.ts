import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { ActivityLogService } from './activity-log.service';
import { CreateActivityLogDto } from './dto/create-activity-log.dto';

@UseGuards(JwtAuthGuard)
@Controller()
export class ActivityLogController {
  constructor(private readonly activityLogService: ActivityLogService) {}

  @Post('tasks/:taskId/activities')
  create(@Param('taskId') taskId: string, @Body() dto: CreateActivityLogDto) {
    return this.activityLogService.create(taskId, dto);
  }

  @Get('tasks/:taskId/activities')
  findByTask(@Param('taskId') taskId: string) {
    return this.activityLogService.findByTask(taskId);
  }

  @Get('workspaces/:workspaceId/activities')
  findByWorkspace(@Param('workspaceId') workspaceId: string) {
    return this.activityLogService.findByWorkspace(workspaceId);
  }
}
