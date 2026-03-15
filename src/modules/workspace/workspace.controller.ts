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
  remove(@Param('id') id: string) {
    return this.workspaceService.remove(id);
  }

  @Get(':id/workload')
  getWorkload(@Param('id') id: string) {
    return this.workspaceService.getWorkload(id);
  }

  @Get(':id/reports')
  getReports(@Param('id') id: string) {
    return this.workspaceService.getReports(id);
  }
}
