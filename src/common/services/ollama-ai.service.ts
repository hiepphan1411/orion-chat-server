import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { GeminiAiService } from './gemini-ai.service';

interface OllamaChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OllamaChatResponse {
  message?: {
    role?: string;
    content?: string;
  };
  prompt_eval_count?: number;
  eval_count?: number;
}

interface OllamaEmbeddingResponse {
  embedding?: number[];
  embeddings?: number[][];
}

@Injectable()
export class OllamaAiService {
  private readonly logger = new Logger(OllamaAiService.name);
  private readonly maxInputLength = 18000;
  private readonly blockedPatterns = [
    'ignore all previous',
    'ignore previous instructions',
    'forget your instructions',
    'forget everything',
    'you are now',
    'act as',
    'pretend to be',
    'disregard all',
    'override instructions',
    'system prompt',
    'jailbreak',
    'drop table',
    'union select',
    '<script',
    'javascript:',
    'onerror=',
    'onload=',
    'bỏ qua tất cả',
    'bỏ qua hướng dẫn',
    'quên tất cả',
    'quên hướng dẫn',
    'bạn bây giờ là',
    'giả vờ là',
  ];

  constructor(
    private readonly configService: ConfigService,
    private readonly geminiAiService: GeminiAiService,
  ) {}

  sanitize(input: string, maxLength = this.maxInputLength): string {
    const normalized = String(input || '').trim();
    if (!normalized) {
      throw new BadRequestException('Input cannot be empty');
    }
    if (normalized.length > maxLength) {
      throw new BadRequestException(
        `Input is too long. Max ${maxLength} characters allowed.`,
      );
    }

    const lowerInput = normalized.toLowerCase();
    for (const pattern of this.blockedPatterns) {
      if (lowerInput.includes(pattern.toLowerCase())) {
        throw new BadRequestException(
          'Input contains restricted prompt-injection content. Please rephrase.',
        );
      }
    }

    return normalized;
  }

  async generateText(options: {
    systemPrompt: string;
    userPrompt: string;
    temperature?: number;
    maxOutputTokens?: number;
    model?: string;
  }): Promise<{ text: string; tokenUsed?: number; usedFallback: boolean }> {
    if (this.shouldUseGemini()) {
      return this.geminiAiService.generateText(options);
    }

    return this.generateChat({
      messages: [
        { role: 'system', content: options.systemPrompt },
        { role: 'user', content: options.userPrompt },
      ],
      temperature: options.temperature,
      maxOutputTokens: options.maxOutputTokens,
      model: options.model,
    });
  }

  async generateChat(options: {
    messages: OllamaChatMessage[];
    temperature?: number;
    maxOutputTokens?: number;
    model?: string;
  }): Promise<{ text: string; tokenUsed?: number; usedFallback: boolean }> {
    if (this.shouldUseGemini()) {
      return this.geminiAiService.generateChat(options);
    }

    const endpoint = this.getChatUrl();
    const model = options.model || this.getModel();

    try {
      const response = await axios.post<OllamaChatResponse>(endpoint, {
        model,
        stream: false,
        messages: options.messages,
        options: {
          temperature: options.temperature ?? 0.35,
          num_predict: options.maxOutputTokens ?? 2048,
        },
      });

      const text = response.data.message?.content?.trim() || '';
      const tokenUsed =
        (response.data.prompt_eval_count || 0) + (response.data.eval_count || 0);

      return {
        text,
        tokenUsed: tokenUsed || undefined,
        usedFallback: text.length === 0,
      };
    } catch (error) {
      this.logger.warn(
        `Ollama request failed at ${endpoint}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
      return {
        text: '',
        usedFallback: true,
      };
    }
  }

  async generateJson<T>(options: {
    systemPrompt: string;
    userPrompt: string;
    fallback: T;
    temperature?: number;
    maxOutputTokens?: number;
    model?: string;
  }): Promise<{ data: T; tokenUsed?: number; usedFallback: boolean }> {
    const response = await this.generateText(options);
    if (response.usedFallback || !response.text) {
      return {
        data: options.fallback,
        tokenUsed: response.tokenUsed,
        usedFallback: true,
      };
    }

    const parsed = this.parseJson<T>(response.text);
    if (!parsed) {
      return {
        data: options.fallback,
        tokenUsed: response.tokenUsed,
        usedFallback: true,
      };
    }

    return {
      data: parsed,
      tokenUsed: response.tokenUsed,
      usedFallback: false,
    };
  }

  async embedText(text: string): Promise<number[]> {
    const endpoint = this.getEmbeddingUrl();
    const model =
      this.configService.get<string>('OLLAMA_EMBEDDING_MODEL') ||
      this.getModel();

    try {
      const response = await axios.post<OllamaEmbeddingResponse>(endpoint, {
        model,
        prompt: text,
      });

      const embedding = response.data.embedding || response.data.embeddings?.[0];
      if (embedding?.length) {
        return embedding;
      }

      this.logger.warn('Ollama embedding returned an empty vector');
      return this.hashEmbedding(text);
    } catch (error) {
      this.logger.warn(
        `Ollama embedding failed at ${endpoint}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
      return this.hashEmbedding(text);
    }
  }

  private getChatUrl() {
    return (
      this.configService.get<string>('OLLAMA_API_URL') ||
      'http://localhost:11434/api/chat'
    );
  }

  private getEmbeddingUrl() {
    const explicit = this.configService.get<string>('OLLAMA_EMBEDDING_API_URL');
    if (explicit) {
      return explicit;
    }

    return this.getChatUrl().replace(/\/api\/chat$/, '/api/embeddings');
  }

  private getModel() {
    return this.configService.get<string>('OLLAMA_MODEL') || 'qwen2.5:7b';
  }

  private shouldUseGemini() {
    const provider = (
      this.configService.get<string>('AI_PROVIDER') || 'ollama'
    ).toLowerCase();

    if (provider !== 'gemini') {
      return false;
    }

    if (!this.geminiAiService.isConfigured()) {
      this.logger.warn(
        'AI_PROVIDER=gemini but no Gemini API key is configured. Falling back to Ollama.',
      );
      return false;
    }

    return true;
  }

  private parseJson<T>(text: string): T | null {
    const trimmed = text.trim();

    try {
      return JSON.parse(trimmed) as T;
    } catch {
      const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
      if (fenced?.[1]) {
        try {
          return JSON.parse(fenced[1]) as T;
        } catch {
          return null;
        }
      }

      const firstBrace = trimmed.indexOf('{');
      const lastBrace = trimmed.lastIndexOf('}');
      if (firstBrace >= 0 && lastBrace > firstBrace) {
        try {
          return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1)) as T;
        } catch {
          return null;
        }
      }

      return null;
    }
  }

  private hashEmbedding(text: string, dimensions = 384): number[] {
    const vector = Array.from({ length: dimensions }, () => 0);
    const tokens = text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter(Boolean);

    for (const token of tokens) {
      let hash = 2166136261;
      for (let index = 0; index < token.length; index += 1) {
        hash ^= token.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
      }
      const bucket = Math.abs(hash) % dimensions;
      vector[bucket] += 1;
    }

    const norm = Math.sqrt(vector.reduce((sum, item) => sum + item * item, 0));
    return norm > 0 ? vector.map((item) => item / norm) : vector;
  }
}
