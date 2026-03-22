import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Document } from './entities/document.entity';
import { DocumentVersion } from './entities/document-version.entity';
import { InlineComment } from './entities/inline-comment.entity';
import { Workspace } from '../workspace/entities/workspace.entity';
import { User } from '../users/entities/user.entity';
import { DocumentService } from './document.service';
import { DocumentController } from './document.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Document,
      DocumentVersion,
      InlineComment,
      Workspace,
      User,
    ]),
  ],
  controllers: [DocumentController],
  providers: [DocumentService],
})
export class DocumentModule {}
