import { IsString, IsNotEmpty, IsEnum, IsBoolean } from 'class-validator';

export class CallActionDto {
  @IsString()
  @IsNotEmpty()
  callId: string;

  @IsString()
  @IsNotEmpty()
  targetUserId: string;
}

export class ToggleMediaDto extends CallActionDto {
  @IsBoolean()
  enabled: boolean;

  @IsEnum(['video', 'audio'])
  mediaType: 'video' | 'audio';
}
