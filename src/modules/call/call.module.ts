import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Call, CallSchema } from './call.schema';
import { CallService } from './call.service';
import { CallController } from './call.controller';
import { CallGateway } from './call.gateway';
import { Message, MessageSchema } from '../message/message.schema';
import { MessageModule } from '../message/message.module';
import { PrivacySettingsModule } from '../privacy-settings/privacy-settings.module';
import { NotificationSettingsModule } from '../notification-settings/notification-settings.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConversationParticipant } from '../conversation/entities/conversation-participant.entity';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Call.name, schema: CallSchema },
      { name: Message.name, schema: MessageSchema },
    ]),
    MessageModule,
    PrivacySettingsModule,
    NotificationSettingsModule,
    TypeOrmModule.forFeature([ConversationParticipant]),
  ],
  providers: [CallService, CallGateway],
  controllers: [CallController],
  exports: [CallService, CallGateway],
})
export class CallModule {}
