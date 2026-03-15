import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm/dist/typeorm.module';
import { Contact } from './entities/contact.entity';
import { UsersService } from '../users/users.service';

@Module({
  imports: [TypeOrmModule.forFeature([Contact, File])],
  controllers: [],
  providers: [UsersService],
})
export class ContactModule {}
