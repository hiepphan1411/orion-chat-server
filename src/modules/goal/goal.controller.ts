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
import { GoalService } from './goal.service';
import { CreateGoalDto } from './dto/create-goal.dto';
import { UpdateGoalDto } from './dto/update-goal.dto';
import { CreateKeyResultDto } from './dto/create-key-result.dto';
import { UpdateKeyResultDto } from './dto/update-key-result.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';

@Controller()
@UseGuards(JwtAuthGuard)
export class GoalController {
  constructor(private readonly goalService: GoalService) {}

  @Post('workspaces/:workspaceId/goals')
  create(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: CreateGoalDto,
  ) {
    return this.goalService.create(workspaceId, dto);
  }

  @Get('workspaces/:workspaceId/goals')
  findAll(@Param('workspaceId') workspaceId: string) {
    return this.goalService.findByWorkspace(workspaceId);
  }

  @Patch('goals/:id')
  update(@Param('id') id: string, @Body() dto: UpdateGoalDto) {
    return this.goalService.update(id, dto);
  }

  @Delete('goals/:id')
  remove(@Param('id') id: string) {
    return this.goalService.remove(id);
  }

  @Post('goals/:goalId/key-results')
  createKeyResult(
    @Param('goalId') goalId: string,
    @Body() dto: CreateKeyResultDto,
  ) {
    return this.goalService.createKeyResult(goalId, dto);
  }

  @Patch('key-results/:krId')
  updateKeyResult(
    @Param('krId') krId: string,
    @Body() dto: UpdateKeyResultDto,
  ) {
    return this.goalService.updateKeyResult(krId, dto);
  }

  @Delete('key-results/:krId')
  removeKeyResult(@Param('krId') krId: string) {
    return this.goalService.removeKeyResult(krId);
  }
}
