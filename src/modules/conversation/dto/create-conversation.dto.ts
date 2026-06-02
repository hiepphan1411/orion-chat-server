import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class MemberNicknameDto {
  @IsUUID()
  userId: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  nickname?: string;
}

export class CreateConversationDto {
  @IsIn(['PRIVATE', 'GROUP'])
  type: 'PRIVATE' | 'GROUP';

  @IsOptional()
  @IsUUID()
  recipientId?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  groupName?: string;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  memberIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => MemberNicknameDto)
  memberNicknames?: MemberNicknameDto[];
}
