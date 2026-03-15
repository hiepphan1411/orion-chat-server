import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotesService } from './notes.service';
import { NotesController } from './notes.controller';
import { CategoriesService } from './categories.service';
import { PersonalNote } from './entities/note.entity';
import { NoteCategory } from './entities/note-category.entity';
import { User } from '../users/entities/user.entity';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

@Module({
  imports: [
    TypeOrmModule.forFeature([PersonalNote, NoteCategory, User]),

    // import JwtModule để dùng trong guard
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get('JWT_SECRET') || 'your-secret-key',
      }),
    }),
  ],
  controllers: [NotesController],
  providers: [NotesService, CategoriesService, JwtAuthGuard],
  exports: [NotesService, CategoriesService],
})
export class NotesModule {}
