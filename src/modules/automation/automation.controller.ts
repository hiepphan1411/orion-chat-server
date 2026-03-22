import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Delete,
  UseGuards,
  Req,
} from '@nestjs/common';
import { AutomationService } from './automation.service';
import { CreateAutomationDto } from './dto/create-automation.dto';
import { UpdateAutomationDto } from './dto/update-automation.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';

@Controller()
@UseGuards(JwtAuthGuard)
export class AutomationController {
  constructor(private readonly automationService: AutomationService) {}

  @Post('workspaces/:workspaceId/automations')
  create(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: CreateAutomationDto,
    @Req() req: any,
  ) {
    const userId = req.user.userId;
    return this.automationService.create(workspaceId, dto, userId);
  }

  @Get('workspaces/:workspaceId/automations')
  findByWorkspace(@Param('workspaceId') workspaceId: string) {
    return this.automationService.findByWorkspace(workspaceId);
  }

  @Patch('automations/:id')
  update(@Param('id') id: string, @Body() dto: UpdateAutomationDto) {
    return this.automationService.update(id, dto);
  }

  @Patch('automations/:id/toggle')
  toggleEnabled(@Param('id') id: string) {
    return this.automationService.toggleEnabled(id);
  }

  @Delete('automations/:id')
  remove(@Param('id') id: string) {
    return this.automationService.remove(id);
  }
}
