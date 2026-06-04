import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Call, CallSchema } from './call.schema';
import { CallService } from './call.service';
import { CallController } from './call.controller';
import { CallGateway } from './call.gateway';
import { Message, MessageSchema } from '../message/message.schema';
import { MessageModule } from '../message/message.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Call.name, schema: CallSchema },
      { name: Message.name, schema: MessageSchema },
    ]),
    MessageModule,
  ],
  providers: [CallService, CallGateway],
  controllers: [CallController],
  exports: [CallService, CallGateway],
})
export class CallModule {}
