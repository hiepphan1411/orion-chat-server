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

  @Post('pipeline/ingest-batch')
  async ingestBatch(
    @CurrentUser() user: CurrentUserPayload,
    @Body()
    body: {
      documents: Array<{ title: string; content: string; tags?: string[] }>;
      chunking?: { chunkSize?: number; overlap?: number };
      replaceAll?: boolean;
    },
  ) {
    return this.aiRagService.ingestBatch(user.userId, body);
  }

  @Post('pipeline/benchmark')
  async benchmark(
    @CurrentUser() user: CurrentUserPayload,
    @Body()
    body: {
      samples: Array<{
        query: string;
        expectedDocumentIds?: string[];
        expectedKeywords?: string[];
      }>;
      topK?: number;
      retrievalConfig?: {
        candidateLimit?: number;
        minScore?: number;
        deduplicateByDocument?: boolean;
      };
    },
  ) {
    return this.aiRagService.benchmarkRetrieval(user.userId, body);
  }

  @Post('pipeline/tune-chunk')
  async tuneChunk(
    @CurrentUser() user: CurrentUserPayload,
    @Body()
    body: {
      configs: Array<{ chunkSize?: number; overlap?: number }>;
      samples: Array<{
        query: string;
        expectedDocumentIds?: string[];
        expectedKeywords?: string[];
      }>;
      topK?: number;
      retrievalConfig?: {
        candidateLimit?: number;
        minScore?: number;
        deduplicateByDocument?: boolean;
      };
    },
  ) {
    return this.aiRagService.tuneChunkConfigs(user.userId, body);
  }

  @Post('pipeline/tune-prompt')
  async tunePrompt(
    @CurrentUser() user: CurrentUserPayload,
    @Body()
    body: {
      variants: Array<{ name: string; systemPrompt: string }>;
      samples: Array<{ query: string; expectedKeywords?: string[] }>;
      topK?: number;
      model?: string;
    },
  ): Promise<{
    winner: {
      name: string;
      avgKeywordCoverage: number;
      avgGroundedness: number;
      avgScore: number;
    };
    variants: Array<{
      name: string;
      avgKeywordCoverage: number;
      avgGroundedness: number;
      avgScore: number;
    }>;
  }> {
    return this.aiRagService.tunePromptVariants(user.userId, body);
  }

  @Post('pipeline/ab-test')
  async abTest(
    @CurrentUser() user: CurrentUserPayload,
    @Body()
    body: {
      variantA: { name: string; systemPrompt: string };
      variantB: { name: string; systemPrompt: string };
      samples: Array<{ query: string; expectedKeywords?: string[] }>;
      topK?: number;
      model?: string;
    },
  ): Promise<{
    winner: string;
    variantA: {
      name: string;
      avgKeywordCoverage: number;
      avgGroundedness: number;
      avgScore: number;
    };
    variantB: {
      name: string;
      avgKeywordCoverage: number;
      avgGroundedness: number;
      avgScore: number;
    };
    delta: {
      avgScore: number;
      avgKeywordCoverage: number;
      avgGroundedness: number;
    };
  }> {
    const result = await this.aiRagService.runABTest(user.userId, body);
    return result;
  }
}
