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
import { EpicService } from './epic.service';
import { CreateEpicDto } from './dto/create-epic.dto';
import { UpdateEpicDto } from './dto/update-epic.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';

@Controller()
@UseGuards(JwtAuthGuard)
export class EpicController {
  constructor(private readonly epicService: EpicService) {}

  @Post('workspaces/:workspaceId/epics')
  create(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: CreateEpicDto,
  ) {
    return this.epicService.create(workspaceId, dto);
  }

  @Get('workspaces/:workspaceId/epics')
  findAll(@Param('workspaceId') workspaceId: string) {
    return this.epicService.findByWorkspace(workspaceId);
  }

  @Patch('epics/:id')
  update(@Param('id') id: string, @Body() dto: UpdateEpicDto) {
    return this.epicService.update(id, dto);
  }

  @Delete('epics/:id')
  remove(@Param('id') id: string) {
    return this.epicService.remove(id);
  }
}
