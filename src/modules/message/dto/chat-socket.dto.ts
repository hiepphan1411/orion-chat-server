import {
  IsBoolean,
  IsIn,
  Matches,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class JoinConversationSocketDto {
  @IsString()
  @MinLength(1)
  requestId: string;

  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, {
    message: 'conversationId must be a UUID',
  })
  conversationId: string;
}

export class SendMessageSocketDto {
  @IsString()
  @MinLength(1)
  requestId: string;

  @IsString()
  @MinLength(1)
  clientMessageId: string;

  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, {
    message: 'conversationId must be a UUID',
  })
  conversationId: string;

  @IsOptional()
  @IsUUID()
  receiverId?: string;

  @IsIn(['text', 'image', 'file', 'audio', 'call', 'video'])
  type: 'text' | 'image' | 'file' | 'audio' | 'call' | 'video';

  @IsString()
  @MaxLength(5000)
  content: string;

  @IsOptional()
  @IsString()
  mediaUrl?: string;

  @IsOptional()
  @IsString()
  fileName?: string;

  @IsOptional()
  fileSize?: number;

  @IsOptional()
  @IsString()
  replyToMessageId?: string;

  @IsOptional()
  callData?: {
    callType?: 'audio' | 'video';
    callStatus?: 'completed' | 'missed' | 'declined';
    duration?: number;
    isInitiator?: boolean;
    wasRejected?: boolean;
  };
}

export class TypingSocketDto {
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, {
    message: 'conversationId must be a UUID',
  })
  conversationId: string;

  @IsBoolean()
  isTyping: boolean;
}
