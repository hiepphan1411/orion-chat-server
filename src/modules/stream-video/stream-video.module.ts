import { Module } from '@nestjs/common';
import { StreamVideoController } from './stream-video.controller';

@Module({
  controllers: [StreamVideoController],
})
export class StreamVideoModule {}
