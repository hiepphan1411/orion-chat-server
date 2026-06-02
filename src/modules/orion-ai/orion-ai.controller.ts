import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { CurrentUserPayload } from 'src/common/decorators/current-user.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import {
  AnalyzeTextDto,
  DeadlineInsightsDto,
  DocumentAssistDto,
  EmotionDetectionDto,
  KnowledgeSearchDto,
  ReplySuggestionsDto,
  RewriteMessageDto,
  SprintSummaryDto,
  SummarizeConversationDto,
  TaskDraftDto,
  UpdateAiSettingsDto,
  WorkspaceAskDto,
} from './dto/orion-ai.dto';
import { OrionAiService } from './orion-ai.service';

@Controller('orion-ai')
@UseGuards(JwtAuthGuard)
export class OrionAiController {
  constructor(private readonly orionAiService: OrionAiService) {}

  @Get('settings')
  getSettings(@CurrentUser() user: CurrentUserPayload) {
    return this.orionAiService.getAiSettings(user.userId);
  }

  @Patch('settings')
  updateSettings(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: UpdateAiSettingsDto,
  ) {
    return this.orionAiService.updateAiSettings(user.userId, body);
  }

  @Post('chat/summarize')
  summarizeConversation(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: SummarizeConversationDto,
  ) {
    return this.orionAiService.summarizeConversation(user.userId, body);
  }

  @Post('chat/reply-suggestions')
  suggestReplies(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: ReplySuggestionsDto,
  ) {
    return this.orionAiService.suggestReplies(user.userId, body);
  }

  @Post('chat/rewrite')
  rewriteMessage(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: RewriteMessageDto,
  ) {
    return this.orionAiService.rewriteMessage(user.userId, body);
  }

  @Post('chat/text-to-workflow')
  analyzeText(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: AnalyzeTextDto,
  ) {
    return this.orionAiService.analyzeText(user.userId, body);
  }

  @Post('chat/emotion')
  detectEmotion(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: EmotionDetectionDto,
  ) {
    return this.orionAiService.detectEmotion(user.userId, body);
  }

  @Post('workhub/task-draft')
  createTaskDraft(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: TaskDraftDto,
  ) {
    return this.orionAiService.createTaskDraft(user.userId, body);
  }

  @Post('workhub/deadline-insights')
  deadlineInsights(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: DeadlineInsightsDto,
  ) {
    return this.orionAiService.deadlineInsights(user.userId, body);
  }

  @Post('workhub/sprint-summary')
  sprintSummary(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: SprintSummaryDto,
  ) {
    return this.orionAiService.sprintSummary(user.userId, body);
  }

  @Post('documents/assist')
  documentAssist(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: DocumentAssistDto,
  ) {
    return this.orionAiService.documentAssist(user.userId, body);
  }

  @Post('knowledge/search')
  knowledgeSearch(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: KnowledgeSearchDto,
  ) {
    return this.orionAiService.knowledgeSearch(user.userId, body);
  }

  @Post('workspace/ask')
  askWorkspace(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: WorkspaceAskDto,
  ) {
    return this.orionAiService.askWorkspace(user.userId, body);
  }
}
