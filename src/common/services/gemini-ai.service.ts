import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosError } from 'axios';
import { GeminiApiKeyConfigService } from './gemini-api-key-config.service';
import { GeminiApiKeyManagementService } from './gemini-api-key-management.service';

export interface GeminiChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface GeminiPart {
  text?: string;
}

interface GeminiResponse {
  candidates?: Array<{
    finishReason?: string;
    content?: {
      parts?: GeminiPart[];
    };
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
}

@Injectable()
export class GeminiAiService {
  private readonly logger = new Logger(GeminiAiService.name);

  constructor(
    private readonly apiKeyConfig: GeminiApiKeyConfigService,
    private readonly apiKeyManagementService: GeminiApiKeyManagementService,
  ) {}

  isConfigured(): boolean {
    return this.apiKeyConfig.getApiKeyCount() > 0;
  }

  async generateText(options: {
    systemPrompt: string;
    userPrompt: string;
    temperature?: number;
    maxOutputTokens?: number;
    model?: string;
  }): Promise<{ text: string; tokenUsed?: number; usedFallback: boolean }> {
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
    messages: GeminiChatMessage[];
    temperature?: number;
    maxOutputTokens?: number;
    model?: string;
  }): Promise<{ text: string; tokenUsed?: number; usedFallback: boolean }> {
    const maxAttempts = this.apiKeyManagementService.getApiKeyCount();
    if (maxAttempts === 0) {
      this.logger.warn('Gemini request skipped because no API keys are configured');
      return { text: '', usedFallback: true };
    }

    const failures: string[] = [];
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      let apiKey = '';
      try {
        apiKey = await this.apiKeyManagementService.getNextAvailableApiKey();
        const response = await this.callGeminiWithKey(apiKey, options);
        if (response) {
          await this.apiKeyManagementService.recordSuccess(apiKey);
          return response;
        }

        await this.apiKeyManagementService.recordFailure(
          apiKey,
          'Rate limit or quota exceeded',
        );
        failures.push(`Attempt ${attempt + 1}: rate limited`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        failures.push(`Attempt ${attempt + 1}: ${message}`);
        if (apiKey) {
          await this.apiKeyManagementService.recordFailure(apiKey, message);
        }
      }
    }

    this.logger.warn(`All Gemini attempts failed: ${failures.join('; ')}`);
    return { text: '', usedFallback: true };
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

  private async callGeminiWithKey(
    apiKey: string,
    options: {
      messages: GeminiChatMessage[];
      temperature?: number;
      maxOutputTokens?: number;
      model?: string;
    },
  ): Promise<
    | { text: string; tokenUsed?: number; usedFallback: boolean }
    | null
  > {
    const model = this.resolveModel(options.model);
    const url = this.apiKeyConfig.getApiUrl(model);
    const requestBody = this.buildRequestBody(options);

    try {
      const response = await axios.post<GeminiResponse>(url, requestBody, {
        headers: {
          'Content-Type': 'application/json',
          'X-goog-api-key': apiKey,
        },
      });

      const text = this.parseTextResponse(response.data);
      const tokenUsed =
        response.data.usageMetadata?.totalTokenCount ||
        ((response.data.usageMetadata?.promptTokenCount || 0) +
          (response.data.usageMetadata?.candidatesTokenCount || 0)) ||
        undefined;

      return {
        text,
        tokenUsed,
        usedFallback: text.length === 0,
      };
    } catch (error) {
      if (this.isRateLimitError(error)) {
        return null;
      }

      throw new Error(this.describeGeminiError(error));
    }
  }

  private buildRequestBody(options: {
    messages: GeminiChatMessage[];
    temperature?: number;
    maxOutputTokens?: number;
  }) {
    const systemPrompt = options.messages
      .filter((message) => message.role === 'system')
      .map((message) => message.content)
      .join('\n\n');

    const contents = options.messages
      .filter((message) => message.role !== 'system')
      .map((message) => ({
        role: message.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: message.content }],
      }));

    if (contents.length === 0) {
      contents.push({
        role: 'user',
        parts: [{ text: systemPrompt || 'Hello' }],
      });
    }

    return {
      contents,
      systemInstruction: systemPrompt
        ? {
            parts: [{ text: systemPrompt }],
          }
        : undefined,
      generationConfig: {
        temperature: options.temperature ?? 0.35,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: options.maxOutputTokens ?? 2048,
      },
    };
  }

  private parseTextResponse(response: GeminiResponse): string {
    const candidate = response.candidates?.[0];
    const text =
      candidate?.content?.parts
        ?.map((part) => part.text || '')
        .join('')
        .trim() || '';

    if (
      candidate?.finishReason &&
      !['STOP', 'MAX_TOKENS'].includes(candidate.finishReason)
    ) {
      this.logger.warn(
        `Gemini candidate finished with reason ${candidate.finishReason}`,
      );
    }

    return text;
  }

  private resolveModel(model?: string): string {
    if (model && model.toLowerCase().includes('gemini')) {
      return model;
    }
    return this.apiKeyConfig.getModel();
  }

  private isRateLimitError(error: unknown): boolean {
    return (
      axios.isAxiosError(error) &&
      (error.response?.status === 429 || error.response?.status === 503)
    );
  }

  private describeGeminiError(error: unknown): string {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<{ error?: { message?: string } }>;
      const status = axiosError.response?.status;
      const message =
        axiosError.response?.data?.error?.message || axiosError.message;
      return status ? `Gemini API returned ${status}: ${message}` : message;
    }

    return error instanceof Error ? error.message : 'Unknown Gemini API error';
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
}
