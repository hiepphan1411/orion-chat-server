import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export enum ChatSummaryMode {
  RANGE = 'range',
  UNREAD = 'unread',
}

export enum RewriteTone {
  PROFESSIONAL = 'professional',
  POLITE = 'polite',
  CONCISE = 'concise',
}

export class SummarizeConversationDto {
  @IsString()
  conversationId: string;

  @IsOptional()
  @IsEnum(ChatSummaryMode)
  mode?: ChatSummaryMode;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3)
  rangeMonths?: number;
}

export class ReplySuggestionsDto {
  @IsString()
  conversationId: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(6)
  limit?: number;
}

export class RewriteMessageDto {
  @IsString()
  message: string;

  @IsEnum(RewriteTone)
  tone: RewriteTone;

  @IsOptional()
  @IsString()
  audience?: string;
}

export class AnalyzeTextDto {
  @IsString()
  text: string;

  @IsOptional()
  @IsString()
  conversationId?: string;

  @IsOptional()
  @IsString()
  workspaceId?: string;
}

export class TaskDraftDto {
  @IsOptional()
  @IsString()
  conversationId?: string;

  @IsOptional()
  @IsString()
  workspaceId?: string;

  @IsOptional()
  @IsString()
  text?: string;
}

export class DeadlineInsightsDto {
  @IsOptional()
  @IsString()
  workspaceId?: string;
}

export class SprintSummaryDto {
  @IsOptional()
  @IsString()
  workspaceId?: string;

  @IsOptional()
  @IsString()
  sprintId?: string;
}

export class EmotionDetectionDto {
  @IsOptional()
  @IsString()
  messageId?: string;

  @IsOptional()
  @IsString()
  text?: string;
}

export class DocumentAssistDto {
  @IsString()
  prompt: string;

  @IsOptional()
  @IsString()
  documentId?: string;

  @IsOptional()
  @IsString()
  workspaceId?: string;

  @IsOptional()
  @IsString()
  selectedText?: string;
}

export class KnowledgeSearchDto {
  @IsString()
  query: string;

  @IsOptional()
  @IsString()
  workspaceId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8)
  topK?: number;
}

export class WorkspaceAskDto {
  @IsString()
  workspaceId: string;

  @IsString()
  question: string;
}

export class UpdateAiSettingsDto {
  @IsOptional()
  @IsBoolean()
  smartEmotionDetection?: boolean;

  @IsOptional()
  @IsBoolean()
  autoWorkflowSuggestions?: boolean;

  @IsOptional()
  @IsBoolean()
  aiMemoryEnabled?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  enabledAgents?: string[];
}
