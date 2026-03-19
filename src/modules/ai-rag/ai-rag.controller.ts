import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { CurrentUserPayload } from 'src/common/decorators/current-user.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { AIRagService } from './ai-rag.service';

@Controller('ai-rag')
@UseGuards(JwtAuthGuard)
export class AIRagController {
  constructor(private readonly aiRagService: AIRagService) {}

  @Post('documents')
  async ingestDocument(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { title: string; content: string; tags?: string[] },
  ) {
    return this.aiRagService.ingestDocument(
      user.userId,
      body.title,
      body.content,
      body.tags,
    );
  }

  @Get('documents')
  async listDocuments(@CurrentUser() user: CurrentUserPayload) {
    return this.aiRagService.listDocuments(user.userId);
  }

  @Delete('documents/:documentId')
  async deleteDocument(
    @CurrentUser() user: CurrentUserPayload,
    @Param('documentId') documentId: string,
  ) {
    const deletedCount = await this.aiRagService.deleteDocument(
      user.userId,
      documentId,
    );
    return { deletedCount };
  }

  @Post('retrieve')
  async retrieveChunks(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { query: string; topK?: number },
  ) {
    return this.aiRagService.retrieveRelevantChunks(
      user.userId,
      body.query,
      body.topK,
    );
  }
}
