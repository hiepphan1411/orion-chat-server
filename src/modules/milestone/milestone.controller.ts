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
import { MilestoneService } from './milestone.service';
import { CreateMilestoneDto } from './dto/create-milestone.dto';
import { UpdateMilestoneDto } from './dto/update-milestone.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';

@Controller()
@UseGuards(JwtAuthGuard)
export class MilestoneController {
  constructor(private readonly milestoneService: MilestoneService) {}

  @Post('workspaces/:workspaceId/milestones')
  create(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: CreateMilestoneDto,
  ) {
    return this.milestoneService.create(workspaceId, dto);
  }

  @Get('workspaces/:workspaceId/milestones')
  findAll(@Param('workspaceId') workspaceId: string) {
    return this.milestoneService.findByWorkspace(workspaceId);
  }

  @Patch('milestones/:id')
  update(@Param('id') id: string, @Body() dto: UpdateMilestoneDto) {
    return this.milestoneService.update(id, dto);
  }

  @Delete('milestones/:id')
  remove(@Param('id') id: string) {
    return this.milestoneService.remove(id);
  }
}
