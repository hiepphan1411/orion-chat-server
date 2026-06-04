import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Friendship } from '../friendship/entities/friendship.entity';
import { GroupConversation } from '../conversation/entities/group-conversation.entity';
import { GroupMember } from '../group-member/entities/group-member.entity';
import { User } from '../users/entities/user.entity';
import { CalendarEventController } from './calendar-event.controller';
import { CalendarEventService } from './calendar-event.service';
import { CalendarEvent } from './entities/calendar-event.entity';
import { CalendarEventParticipant } from './entities/calendar-event-participant.entity';
import { NotificationModule } from '../notifications/notification.module';
import { MessageModule } from '../message/message.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CalendarEvent,
      CalendarEventParticipant,
      User,
      Friendship,
      GroupMember,
      GroupConversation,
    ]),
    NotificationModule,
    MessageModule,
  ],
  controllers: [CalendarEventController],
  providers: [CalendarEventService],
  exports: [CalendarEventService],
})
export class CalendarEventModule {}
