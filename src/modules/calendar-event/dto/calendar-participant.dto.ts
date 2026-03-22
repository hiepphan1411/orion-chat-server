import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  ValidateIf,
} from 'class-validator';
import { CalendarParticipantType } from '../entities/calendar-event-participant.entity';

export class CalendarParticipantDto {
  @IsEnum(CalendarParticipantType)
  type: CalendarParticipantType;

  @ValidateIf((o) => o.type === CalendarParticipantType.FRIEND)
  @IsUUID()
  userId?: string;

  @ValidateIf((o) => o.type === CalendarParticipantType.GROUP)
  @IsUUID()
  groupId?: string;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;
}
