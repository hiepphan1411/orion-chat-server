import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { SprintService } from './sprint.service';
import { CreateSprintDto } from './dto/create-sprint.dto';
import { UpdateSprintDto } from './dto/update-sprint.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';

@Controller()
@UseGuards(JwtAuthGuard)
export class SprintController {
  constructor(private readonly sprintService: SprintService) {}

  @Post('workspaces/:workspaceId/sprints')
  create(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: CreateSprintDto,
  ) {
    return this.sprintService.create(workspaceId, dto);
  }

  @Get('workspaces/:workspaceId/sprints')
  findAll(@Param('workspaceId') workspaceId: string) {
    return this.sprintService.findByWorkspace(workspaceId);
  }

  @Get('sprints/:id')
  findOne(@Param('id') id: string) {
    return this.sprintService.findOne(id);
  }

  @Patch('sprints/:id')
  update(@Param('id') id: string, @Body() dto: UpdateSprintDto) {
    return this.sprintService.update(id, dto);
  }

  @Delete('sprints/:id')
  remove(@Param('id') id: string) {
    return this.sprintService.remove(id);
  }

  @Get('sprints/:id/tasks')
  getSprintTasks(@Param('id') id: string) {
    return this.sprintService.getSprintTasks(id);
  }
}
