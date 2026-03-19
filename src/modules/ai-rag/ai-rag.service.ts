import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import axios from 'axios';
import { randomUUID } from 'crypto';
import { Model } from 'mongoose';
import { AIRagChunk, AIRagChunkDocument } from './ai-rag.schema';

interface GeminiEmbeddingResponse {
  embedding?: {
    values?: number[];
  };
}

interface HttpErrorLike {
  response?: {
    status?: number;
    data?: unknown;
  };
  message?: string;
}

export interface RagChunkScore {
  documentId: string;
  title: string;
  content: string;
  chunkIndex: number;
  score: number;
}

export interface ListDocumentRow {
  _id: string;
  title: string;
  tags: string[];
  chunkCount: number;
  updatedAt: string;
}

@Injectable()
export class AIRagService {
  constructor(
    @InjectModel(AIRagChunk.name)
    private readonly ragChunkModel: Model<AIRagChunkDocument>,
    private readonly configService: ConfigService,
  ) {}

  async ingestDocument(
    userId: string,
    title: string,
    content: string,
    tags: string[] = [],
  ): Promise<{ documentId: string; chunkCount: number }> {
    const normalizedTitle = title.trim();
    const normalizedContent = content.trim();

    if (!normalizedTitle) {
      throw new BadRequestException('Title is required');
    }

    if (!normalizedContent) {
      throw new BadRequestException('Content is required');
    }

    const chunks = this.chunkText(normalizedContent);
    if (chunks.length === 0) {
      throw new BadRequestException('Document content is too short');
    }

    const documentId = randomUUID();
    const cleanTags = tags
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);

    const rows: Array<{
      userId: string;
      documentId: string;
      title: string;
      content: string;
      chunkIndex: number;
      embedding: number[];
      tags: string[];
    }> = [];

    for (let index = 0; index < chunks.length; index += 1) {
      const chunk = chunks[index];
      const embedding = await this.embedText(chunk);
      rows.push({
        userId,
        documentId,
        title: normalizedTitle,
        content: chunk,
        chunkIndex: index,
        embedding,
        tags: cleanTags,
      });
    }

    await this.ragChunkModel.insertMany(rows);

    return {
      documentId,
      chunkCount: rows.length,
    };
  }

  async listDocuments(userId: string): Promise<ListDocumentRow[]> {
    return this.ragChunkModel
      .aggregate<ListDocumentRow>([
        { $match: { userId } },
        {
          $group: {
            _id: '$documentId',
            title: { $first: '$title' },
            tags: { $first: '$tags' },
            chunkCount: { $sum: 1 },
            updatedAt: { $max: '$updatedAt' },
          },
        },
        { $sort: { updatedAt: -1 } },
      ])
      .exec();
  }

  async deleteDocument(userId: string, documentId: string): Promise<number> {
    const result = await this.ragChunkModel
      .deleteMany({ userId, documentId })
      .exec();
    return result.deletedCount ?? 0;
  }

  async retrieveRelevantChunks(
    userId: string,
    query: string,
    topK = 4,
  ): Promise<RagChunkScore[]> {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      return [];
    }

    const chunks = await this.ragChunkModel
      .find({ userId })
      .select('documentId title content chunkIndex embedding')
      .lean()
      .limit(1000)
      .exec();

    // No knowledge base yet: skip embedding call and let chat continue normally.
    if (chunks.length === 0) {
      return [];
    }

    const queryEmbedding = await this.embedText(normalizedQuery);

    const scored = chunks
      .map((item) => ({
        documentId: item.documentId,
        title: item.title,
        content: item.content,
        chunkIndex: item.chunkIndex,
        score: this.cosineSimilarity(queryEmbedding, item.embedding),
      }))
      .filter((item) => Number.isFinite(item.score))
      .sort((left, right) => right.score - left.score)
      .slice(0, Math.max(1, Math.min(topK, 10)));

    return scored;
  }

  private chunkText(text: string, chunkSize = 900, overlap = 120): string[] {
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (!normalized) {
      return [];
    }

    const chunks: string[] = [];
    let start = 0;

    while (start < normalized.length) {
      const end = Math.min(start + chunkSize, normalized.length);
      const chunk = normalized.slice(start, end).trim();
      if (chunk.length > 0) {
        chunks.push(chunk);
      }
      if (end === normalized.length) {
        break;
      }
      start = Math.max(0, end - overlap);
    }

    return chunks;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length === 0 || b.length === 0 || a.length !== b.length) {
      return -1;
    }

    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i += 1) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    if (denom === 0) {
      return -1;
    }

    return dot / denom;
  }

  private async embedText(text: string): Promise<number[]> {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      throw new InternalServerErrorException(
        'Missing GEMINI_API_KEY on server',
      );
    }

    const candidateModels = [
      'models/gemini-embedding-001',
      'models/text-embedding-004',
    ];

    let lastError: string | null = null;

    for (const model of candidateModels) {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/${model}:embedContent?key=${apiKey}`;

      try {
        const response = await axios.post<GeminiEmbeddingResponse>(endpoint, {
          content: {
            parts: [{ text }],
          },
        });

        const values = response.data.embedding?.values;
        if (!values || values.length === 0) {
          throw new InternalServerErrorException(
            'Gemini embedding returned empty vector',
          );
        }

        return values;
      } catch (error) {
        const httpError = error as HttpErrorLike;
        const status = httpError.response?.status;

        // If model is unavailable, continue to next model candidate.
        if (status === 404 || status === 400) {
          lastError = `model ${model} unavailable (${status})`;
          continue;
        }

        throw new InternalServerErrorException(
          `Gemini embedding request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    }

    throw new InternalServerErrorException(
      `Gemini embedding request failed: ${lastError || 'no embedding model available'}`,
    );
  }
}
