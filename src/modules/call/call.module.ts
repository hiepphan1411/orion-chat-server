import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Call, CallSchema } from './call.schema';
import { CallService } from './call.service';
import { CallController } from './call.controller';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Call.name, schema: CallSchema }]),
  ],
  providers: [CallService],
  controllers: [CallController],
  exports: [CallService],
})
export class CallModule {}
