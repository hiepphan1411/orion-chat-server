import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';

export enum CalendarViewMode {
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
  YEAR = 'year',
}

export class QueryCalendarEventDto {
  @IsOptional()
  @IsEnum(CalendarViewMode)
  view?: CalendarViewMode;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsString()
  q?: string;
}
