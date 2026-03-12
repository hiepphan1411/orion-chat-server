import { IsString, IsEnum, IsNotEmpty, IsOptional } from 'class-validator';

export class CallInitiateDto {
  @IsString()
  @IsNotEmpty()
  conversationId: string;

  @IsString()
  @IsNotEmpty()
  receiverId: string;

  @IsEnum(['video', 'audio'])
  callType: 'video' | 'audio';

  @IsString()
  @IsOptional()
  callerName?: string;

  @IsString()
  @IsOptional()
  callerAvatar?: string;
}
