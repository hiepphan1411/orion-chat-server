import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { DocumentService } from './document.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { CreateDocumentVersionDto } from './dto/create-document-version.dto';
import { CreateInlineCommentDto } from './dto/create-inline-comment.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';

@Controller()
@UseGuards(JwtAuthGuard)
export class DocumentController {
  constructor(private readonly documentService: DocumentService) {}

  @Post('workspaces/:workspaceId/documents')
  create(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: CreateDocumentDto,
  ) {
    return this.documentService.create(workspaceId, dto);
  }

  @Get('workspaces/:workspaceId/documents')
  findByWorkspace(@Param('workspaceId') workspaceId: string) {
    return this.documentService.findByWorkspace(workspaceId);
  }

  @Get('documents/:id')
  findOne(@Param('id') id: string) {
    return this.documentService.findOne(id);
  }

  @Patch('documents/:id')
  update(@Param('id') id: string, @Body() dto: UpdateDocumentDto) {
    return this.documentService.update(id, dto);
  }

  @Delete('documents/:id')
  remove(@Param('id') id: string) {
    return this.documentService.remove(id);
  }

  @Post('documents/:id/versions')
  createVersion(
    @Param('id') id: string,
    @Body() dto: CreateDocumentVersionDto,
  ) {
    return this.documentService.createVersion(id, dto);
  }

  @Post('documents/:id/comments')
  createComment(@Param('id') id: string, @Body() dto: CreateInlineCommentDto) {
    return this.documentService.createComment(id, dto);
  }

  @Patch('inline-comments/:id/resolve')
  resolveComment(@Param('id') id: string) {
    return this.documentService.resolveComment(id);
  }
}
