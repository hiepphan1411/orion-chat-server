import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { CurrentUserPayload } from 'src/common/decorators/current-user.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { CalendarEventService } from './calendar-event.service';
import { CreateCalendarEventDto } from './dto/create-calendar-event.dto';
import { QueryCalendarEventDto } from './dto/query-calendar-event.dto';
import { UpdateCalendarEventDto } from './dto/update-calendar-event.dto';
import { CalendarParticipantStatus } from './entities/calendar-event-participant.entity';

@Controller('calendar-events')
@UseGuards(JwtAuthGuard)
export class CalendarEventController {
  constructor(private readonly calendarEventService: CalendarEventService) {}

  @Get()
  findAll(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: QueryCalendarEventDto,
  ) {
    return this.calendarEventService.findAllForUser(user.userId, query);
  }

  @Get('participant-options')
  getParticipantOptions(
    @CurrentUser() user: CurrentUserPayload,
    @Query('q') q?: string,
  ) {
    return this.calendarEventService.getParticipantOptions(user.userId, q);
  }

  @Get('invites')
  getPendingInvites(@CurrentUser() user: CurrentUserPayload) {
    return this.calendarEventService.findPendingInvites(user.userId);
  }

  @Post()
  create(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateCalendarEventDto,
  ) {
    return this.calendarEventService.create(user.userId, dto);
  }

  @Patch(':eventId')
  update(
    @CurrentUser() user: CurrentUserPayload,
    @Param('eventId') eventId: string,
    @Body() dto: UpdateCalendarEventDto,
  ) {
    return this.calendarEventService.update(user.userId, eventId, dto);
  }

  @Patch(':eventId/respond')
  respond(
    @CurrentUser() user: CurrentUserPayload,
    @Param('eventId') eventId: string,
    @Body() body: { status: 'accepted' | 'declined' },
  ) {
    const status =
      body.status === 'declined'
        ? CalendarParticipantStatus.DECLINED
        : CalendarParticipantStatus.ACCEPTED;

    return this.calendarEventService.respondToInvite(
      user.userId,
      eventId,
      status,
    );
  }

  @Delete(':eventId')
  remove(
    @CurrentUser() user: CurrentUserPayload,
    @Param('eventId') eventId: string,
  ) {
    return this.calendarEventService.remove(user.userId, eventId);
  }
}
