import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  CalendarEventCategory,
  CalendarEventRecurrence,
} from '../entities/calendar-event.entity';
import { Type } from 'class-transformer';
import { CalendarParticipantDto } from './calendar-participant.dto';

export class CreateCalendarEventDto {
  @IsString()
  title: string;

  @IsDateString()
  startTime: string;

  @IsDateString()
  endTime: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsEnum(CalendarEventCategory)
  category?: CalendarEventCategory;

  @IsOptional()
  @IsEnum(CalendarEventRecurrence)
  recurrence?: CalendarEventRecurrence;

  @IsOptional()
  @IsInt()
  @Min(0)
  notificationMinutes?: number;

  @IsOptional()
  @IsBoolean()
  isAllDay?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CalendarParticipantDto)
  participants?: CalendarParticipantDto[];
}
