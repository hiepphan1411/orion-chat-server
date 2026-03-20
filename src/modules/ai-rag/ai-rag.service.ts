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
import { AIRagDocument, AIRagDocumentDocument } from './ai-rag-document.schema';
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

export interface ChunkingConfig {
  chunkSize?: number;
  overlap?: number;
}

export interface RetrievalConfig {
  candidateLimit?: number;
  minScore?: number;
  deduplicateByDocument?: boolean;
}

export interface RetrievalBenchmarkSample {
  query: string;
  expectedDocumentIds?: string[];
  expectedKeywords?: string[];
}

export interface PromptBenchmarkSample {
  query: string;
  expectedKeywords?: string[];
}

export interface PromptVariantInput {
  name: string;
  systemPrompt: string;
}

export interface PromptVariantScore {
  name: string;
  avgKeywordCoverage: number;
  avgGroundedness: number;
  avgScore: number;
}

@Injectable()
export class AIRagService {
  constructor(
    @InjectModel(AIRagDocument.name)
    private readonly ragDocumentModel: Model<AIRagDocumentDocument>,
    @InjectModel(AIRagChunk.name)
    private readonly ragChunkModel: Model<AIRagChunkDocument>,
    private readonly configService: ConfigService,
  ) {}

  async ingestDocument(
    userId: string,
    title: string,
    content: string,
    tags: string[] = [],
    options?: { documentId?: string; chunking?: ChunkingConfig },
  ): Promise<{ documentId: string; chunkCount: number }> {
    const normalizedTitle = title.trim();
    const normalizedContent = content.trim();
    const normalizedChunkConfig = this.normalizeChunkConfig(options?.chunking);

    if (!normalizedTitle) {
      throw new BadRequestException('Title is required');
    }

    if (!normalizedContent) {
      throw new BadRequestException('Content is required');
    }

    const chunks = this.chunkText(
      normalizedContent,
      normalizedChunkConfig.chunkSize,
      normalizedChunkConfig.overlap,
    );
    if (chunks.length === 0) {
      throw new BadRequestException('Document content is too short');
    }

    const documentId = options?.documentId || randomUUID();
    const cleanTags = tags
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);

    await this.ragDocumentModel
      .findOneAndUpdate(
        { userId, documentId },
        {
          userId,
          documentId,
          title: normalizedTitle,
          content: normalizedContent,
          tags: cleanTags,
        },
        { upsert: true, new: true },
      )
      .exec();

    await this.ragChunkModel.deleteMany({ userId, documentId }).exec();

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
    const [documents, chunkStats] = await Promise.all([
      this.ragDocumentModel
        .find({ userId })
        .select('documentId title tags updatedAt')
        .sort({ updatedAt: -1 })
        .lean<
          Array<{
            documentId: string;
            title: string;
            tags: string[];
            updatedAt: Date;
          }>
        >()
        .exec(),
      this.ragChunkModel
        .aggregate<{ _id: string; chunkCount: number }>([
          { $match: { userId } },
          {
            $group: {
              _id: '$documentId',
              chunkCount: { $sum: 1 },
            },
          },
        ])
        .exec(),
    ]);

    const chunkCountByDoc = new Map<string, number>(
      chunkStats.map((item) => [item._id, item.chunkCount]),
    );

    return documents.map((doc) => ({
      _id: doc.documentId,
      title: doc.title,
      tags: doc.tags,
      chunkCount: chunkCountByDoc.get(doc.documentId) || 0,
      updatedAt: doc.updatedAt.toISOString(),
    }));
  }

  async deleteDocument(userId: string, documentId: string): Promise<number> {
    const result = await this.ragChunkModel
      .deleteMany({ userId, documentId })
      .exec();
    await this.ragDocumentModel.deleteOne({ userId, documentId }).exec();
    return result.deletedCount ?? 0;
  }

  async retrieveRelevantChunks(
    userId: string,
    query: string,
    topK = 4,
    retrievalConfig?: RetrievalConfig,
  ): Promise<RagChunkScore[]> {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      return [];
    }

    const candidateLimit = Math.max(
      50,
      Math.min(retrievalConfig?.candidateLimit || 1000, 3000),
    );
    const minScore = retrievalConfig?.minScore ?? -1;

    const chunks = await this.ragChunkModel
      .find({ userId })
      .select('documentId title content chunkIndex embedding')
      .lean<
        Array<{
          documentId: string;
          title: string;
          content: string;
          chunkIndex: number;
          embedding: number[];
        }>
      >()
      .limit(candidateLimit)
      .exec();

    if (chunks.length === 0) {
      return [];
    }

    const queryEmbedding = await this.embedText(normalizedQuery);

    const scored: RagChunkScore[] = chunks
      .map((item) => ({
        documentId: item.documentId,
        title: item.title,
        content: item.content,
        chunkIndex: item.chunkIndex,
        score: this.cosineSimilarity(queryEmbedding, item.embedding),
      }))
      .filter((item) => Number.isFinite(item.score) && item.score >= minScore)
      .sort((left, right) => right.score - left.score)
      .slice(0, Math.max(1, Math.min(topK, 10)));

    if (!retrievalConfig?.deduplicateByDocument) {
      return scored;
    }

    const bestByDocument = new Map<string, RagChunkScore>();
    for (const item of scored) {
      const current = bestByDocument.get(item.documentId);
      if (!current || item.score > current.score) {
        bestByDocument.set(item.documentId, item);
      }
    }

    return [...bestByDocument.values()]
      .sort((left, right) => right.score - left.score)
      .slice(0, Math.max(1, Math.min(topK, 10)));
  }

  async ingestBatch(
    userId: string,
    body: {
      documents: Array<{ title: string; content: string; tags?: string[] }>;
      chunking?: ChunkingConfig;
      replaceAll?: boolean;
    },
  ): Promise<{
    documentCount: number;
    chunkCount: number;
    ingested: Array<{ documentId: string; chunkCount: number; title: string }>;
  }> {
    if (!body.documents || body.documents.length === 0) {
      throw new BadRequestException('documents is required');
    }

    if (body.replaceAll) {
      await Promise.all([
        this.ragChunkModel.deleteMany({ userId }).exec(),
        this.ragDocumentModel.deleteMany({ userId }).exec(),
      ]);
    }

    const ingested: Array<{
      documentId: string;
      chunkCount: number;
      title: string;
    }> = [];
    for (const document of body.documents) {
      const result = await this.ingestDocument(
        userId,
        document.title,
        document.content,
        document.tags,
        { chunking: body.chunking },
      );
      ingested.push({
        documentId: result.documentId,
        chunkCount: result.chunkCount,
        title: document.title,
      });
    }

    return {
      documentCount: ingested.length,
      chunkCount: ingested.reduce((sum, item) => sum + item.chunkCount, 0),
      ingested,
    };
  }

  async benchmarkRetrieval(
    userId: string,
    body: {
      samples: RetrievalBenchmarkSample[];
      topK?: number;
      retrievalConfig?: RetrievalConfig;
    },
  ): Promise<{
    summary: {
      total: number;
      hitCount: number;
      hitRate: number;
      mrr: number;
      avgTopScore: number;
    };
    sampleResults: Array<{
      query: string;
      hit: boolean;
      reciprocalRank: number;
      topScore: number;
      retrieved: Array<{ documentId: string; score: number }>;
    }>;
  }> {
    const samples = body.samples || [];
    if (samples.length === 0) {
      throw new BadRequestException('samples is required');
    }

    const topK = Math.max(1, Math.min(body.topK || 4, 10));
    let hitCount = 0;
    let mrrTotal = 0;
    let scoreTotal = 0;

    const sampleResults: Array<{
      query: string;
      hit: boolean;
      reciprocalRank: number;
      topScore: number;
      retrieved: Array<{ documentId: string; score: number }>;
    }> = [];

    for (const sample of samples) {
      const retrieved = await this.retrieveRelevantChunks(
        userId,
        sample.query,
        topK,
        body.retrievalConfig,
      );

      const firstRelevantRank = this.findFirstRelevantRank(sample, retrieved);
      const hit = firstRelevantRank > 0;
      const reciprocalRank = hit ? 1 / firstRelevantRank : 0;
      const topScore = retrieved[0]?.score || 0;

      if (hit) {
        hitCount += 1;
      }
      mrrTotal += reciprocalRank;
      scoreTotal += topScore;

      sampleResults.push({
        query: sample.query,
        hit,
        reciprocalRank,
        topScore,
        retrieved: retrieved.map((item) => ({
          documentId: item.documentId,
          score: item.score,
        })),
      });
    }

    const total = samples.length;

    return {
      summary: {
        total,
        hitCount,
        hitRate: total > 0 ? hitCount / total : 0,
        mrr: total > 0 ? mrrTotal / total : 0,
        avgTopScore: total > 0 ? scoreTotal / total : 0,
      },
      sampleResults,
    };
  }

  async tuneChunkConfigs(
    userId: string,
    body: {
      configs: ChunkingConfig[];
      samples: RetrievalBenchmarkSample[];
      topK?: number;
      retrievalConfig?: RetrievalConfig;
    },
  ): Promise<{
    winner: {
      config: { chunkSize: number; overlap: number };
      metrics: { hitRate: number; mrr: number; avgTopScore: number };
    };
    runs: Array<{
      config: { chunkSize: number; overlap: number };
      metrics: { hitRate: number; mrr: number; avgTopScore: number };
    }>;
  }> {
    const configs = body.configs || [];
    if (configs.length === 0) {
      throw new BadRequestException('configs is required');
    }

    const sourceDocuments = await this.ragDocumentModel
      .find({ userId })
      .select('documentId title content tags')
      .lean<
        Array<{
          documentId: string;
          title: string;
          content: string;
          tags: string[];
        }>
      >()
      .exec();

    if (sourceDocuments.length === 0) {
      throw new BadRequestException(
        'No source documents found. Ingest documents before tuning chunk configs.',
      );
    }

    const runs: Array<{
      config: { chunkSize: number; overlap: number };
      metrics: { hitRate: number; mrr: number; avgTopScore: number };
    }> = [];

    for (const config of configs) {
      const normalized = this.normalizeChunkConfig(config);
      await this.rebuildChunksFromSources(userId, sourceDocuments, normalized);

      const benchmark = await this.benchmarkRetrieval(userId, {
        samples: body.samples,
        topK: body.topK,
        retrievalConfig: body.retrievalConfig,
      });

      runs.push({
        config: normalized,
        metrics: {
          hitRate: benchmark.summary.hitRate,
          mrr: benchmark.summary.mrr,
          avgTopScore: benchmark.summary.avgTopScore,
        },
      });
    }

    runs.sort(
      (left, right) =>
        right.metrics.hitRate +
        right.metrics.mrr -
        (left.metrics.hitRate + left.metrics.mrr),
    );

    const winner = runs[0];
    if (!winner) {
      throw new InternalServerErrorException('Failed to select chunk config');
    }

    await this.rebuildChunksFromSources(userId, sourceDocuments, winner.config);

    return {
      winner,
      runs,
    };
  }

  async tunePromptVariants(
    userId: string,
    body: {
      variants: PromptVariantInput[];
      samples: PromptBenchmarkSample[];
      topK?: number;
      model?: string;
    },
  ): Promise<{
    winner: PromptVariantScore;
    variants: PromptVariantScore[];
  }> {
    const variants = body.variants || [];
    const samples = body.samples || [];

    if (variants.length === 0) {
      throw new BadRequestException('variants is required');
    }
    if (samples.length === 0) {
      throw new BadRequestException('samples is required');
    }

    const model = body.model || 'gemini-2.5-flash';
    const topK = Math.max(1, Math.min(body.topK || 4, 10));

    const variantResults: PromptVariantScore[] = [];

    for (const variant of variants) {
      let keywordCoverageTotal = 0;
      let groundednessTotal = 0;

      for (const sample of samples) {
        const chunks = await this.retrieveRelevantChunks(
          userId,
          sample.query,
          topK,
        );
        const answer = await this.generateGroundedAnswer(
          model,
          sample.query,
          variant.systemPrompt,
          chunks,
        );

        keywordCoverageTotal += this.computeKeywordCoverage(
          answer,
          sample.expectedKeywords,
        );
        groundednessTotal += this.computeGroundedness(answer, chunks);
      }

      const avgKeywordCoverage = keywordCoverageTotal / samples.length;
      const avgGroundedness = groundednessTotal / samples.length;
      const avgScore = avgKeywordCoverage * 0.6 + avgGroundedness * 0.4;

      variantResults.push({
        name: variant.name,
        avgKeywordCoverage,
        avgGroundedness,
        avgScore,
      });
    }

    variantResults.sort((left, right) => right.avgScore - left.avgScore);

    return {
      winner: variantResults[0],
      variants: variantResults,
    };
  }

  async runABTest(
    userId: string,
    body: {
      variantA: PromptVariantInput;
      variantB: PromptVariantInput;
      samples: PromptBenchmarkSample[];
      topK?: number;
      model?: string;
    },
  ): Promise<{
    winner: string;
    variantA: PromptVariantScore;
    variantB: PromptVariantScore;
    delta: {
      avgScore: number;
      avgKeywordCoverage: number;
      avgGroundedness: number;
    };
  }> {
    const { variantA, variantB, samples } = body;
    if (!variantA || !variantB) {
      throw new BadRequestException('variantA and variantB are required');
    }
    if (!samples || samples.length === 0) {
      throw new BadRequestException('samples is required');
    }

    const evaluation = await this.tunePromptVariants(userId, {
      variants: [variantA, variantB],
      samples,
      topK: body.topK,
      model: body.model,
    });

    const variantAResult = evaluation.variants.find(
      (item) => item.name === variantA.name,
    );
    const variantBResult = evaluation.variants.find(
      (item) => item.name === variantB.name,
    );

    if (!variantAResult || !variantBResult) {
      throw new InternalServerErrorException('A/B evaluation failed');
    }

    const winner =
      variantAResult.avgScore >= variantBResult.avgScore
        ? variantAResult.name
        : variantBResult.name;

    return {
      winner,
      variantA: variantAResult,
      variantB: variantBResult,
      delta: {
        avgScore: variantBResult.avgScore - variantAResult.avgScore,
        avgKeywordCoverage:
          variantBResult.avgKeywordCoverage - variantAResult.avgKeywordCoverage,
        avgGroundedness:
          variantBResult.avgGroundedness - variantAResult.avgGroundedness,
      },
    };
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

  private normalizeChunkConfig(config?: ChunkingConfig): {
    chunkSize: number;
    overlap: number;
  } {
    const chunkSize = Math.max(200, Math.min(config?.chunkSize || 900, 2000));
    const overlap = Math.max(
      0,
      Math.min(config?.overlap || 120, chunkSize - 1),
    );
    return { chunkSize, overlap };
  }

  private findFirstRelevantRank(
    sample: RetrievalBenchmarkSample,
    retrieved: RagChunkScore[],
  ): number {
    const expectedDocumentIds = new Set(sample.expectedDocumentIds || []);
    const expectedKeywords = (sample.expectedKeywords || [])
      .map((keyword) => keyword.toLowerCase().trim())
      .filter((keyword) => keyword.length > 0);

    for (let index = 0; index < retrieved.length; index += 1) {
      const item = retrieved[index];
      const hitByDocument =
        expectedDocumentIds.size > 0 &&
        expectedDocumentIds.has(item.documentId);

      const mergedText = `${item.title} ${item.content}`.toLowerCase();
      const hitByKeyword =
        expectedKeywords.length > 0 &&
        expectedKeywords.some((keyword) => mergedText.includes(keyword));

      if (hitByDocument || hitByKeyword) {
        return index + 1;
      }
    }

    return 0;
  }

  private async rebuildChunksFromSources(
    userId: string,
    sourceDocuments: Array<{
      documentId: string;
      title: string;
      content: string;
      tags: string[];
    }>,
    chunking: { chunkSize: number; overlap: number },
  ) {
    await this.ragChunkModel.deleteMany({ userId }).exec();

    for (const source of sourceDocuments) {
      await this.ingestDocument(
        userId,
        source.title,
        source.content,
        source.tags,
        {
          documentId: source.documentId,
          chunking,
        },
      );
    }
  }

  private async generateGroundedAnswer(
    model: string,
    query: string,
    systemPrompt: string,
    chunks: RagChunkScore[],
  ): Promise<string> {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      throw new InternalServerErrorException(
        'Missing GEMINI_API_KEY on server',
      );
    }

    const context = chunks
      .map(
        (chunk, index) =>
          `[${index + 1}] ${chunk.title} (score ${chunk.score.toFixed(3)}): ${chunk.content}`,
      )
      .join('\n\n');

    const effectiveSystemPrompt = context
      ? `${systemPrompt}\n\nUse only the context for facts. If unsure, say you are unsure.\n\nCONTEXT:\n${context}`
      : `${systemPrompt}\n\nNo context was retrieved. Ask for clarification if needed.`;

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const response = await axios.post<{
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    }>(endpoint, {
      systemInstruction: {
        parts: [{ text: effectiveSystemPrompt }],
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: query }],
        },
      ],
      generationConfig: {
        temperature: 0.3,
      },
    });

    const candidateParts = response.data.candidates?.[0]?.content?.parts;
    return (
      candidateParts
        ?.map((part) => part.text || '')
        .join('')
        .trim() || ''
    );
  }

  private computeKeywordCoverage(
    answer: string,
    expectedKeywords?: string[],
  ): number {
    if (!expectedKeywords || expectedKeywords.length === 0) {
      return 1;
    }

    const normalizedAnswer = answer.toLowerCase();
    const normalizedKeywords = expectedKeywords
      .map((keyword) => keyword.toLowerCase().trim())
      .filter((keyword) => keyword.length > 0);

    if (normalizedKeywords.length === 0) {
      return 1;
    }

    const hitCount = normalizedKeywords.filter((keyword) =>
      normalizedAnswer.includes(keyword),
    ).length;
    return hitCount / normalizedKeywords.length;
  }

  private computeGroundedness(answer: string, chunks: RagChunkScore[]): number {
    const answerTokens = this.tokenize(answer);
    if (answerTokens.length === 0) {
      return 0;
    }

    const contextText = chunks.map((chunk) => chunk.content).join(' ');
    const contextTokens = new Set(this.tokenize(contextText));
    if (contextTokens.size === 0) {
      return 0;
    }

    let overlap = 0;
    for (const token of answerTokens) {
      if (contextTokens.has(token)) {
        overlap += 1;
      }
    }

    return overlap / answerTokens.length;
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3);
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
