import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserSectionController } from './user-section.controller';
import { UserSession } from './entities/user-section.entity';
import { UserSessionService } from './user-section.service';

@Module({
  imports: [TypeOrmModule.forFeature([UserSession])],
  controllers: [UserSectionController],
  providers: [UserSessionService],
})
export class UserSectionModule {}
