/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const ROOT = __dirname;
const REPORT_DIR = path.join(ROOT, 'reports');

const BASE_URL = process.env.RAG_BASE_URL || 'http://localhost:3000';
const JWT_TOKEN = process.env.RAG_JWT_TOKEN || '';
const MODEL = process.env.RAG_MODEL || 'gemini-2.5-flash';
const DRY_RUN = process.argv.includes('--dry-run') || !JWT_TOKEN;

function readJson(fileName) {
  const fullPath = path.join(ROOT, fileName);
  return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
}

function buildHeaders() {
  return {
    Authorization: `Bearer ${JWT_TOKEN}`,
    'Content-Type': 'application/json',
  };
}

async function post(client, endpoint, payload) {
  const url = `${BASE_URL}${endpoint}`;
  if (DRY_RUN) {
    return {
      dryRun: true,
      endpoint,
      payloadSummary: {
        keys: Object.keys(payload),
      },
    };
  }

  const response = await client.post(url, payload, {
    headers: buildHeaders(),
  });
  return response.data;
}

async function main() {
  const ingestSeed = readJson('ingest-seed-documents.json');
  const retrievalBenchmark = readJson('benchmark-retrieval-50.json');
  const promptBenchmark = readJson('benchmark-prompt-50.json');

  const promptVariants = [
    {
      name: 'strict-grounded',
      systemPrompt:
        'Use only retrieved context. If information is missing, say you are unsure and ask follow-up question.',
    },
    {
      name: 'helpful-balanced',
      systemPrompt:
        'Be practical and concise. Never invent facts outside retrieved context. If uncertain, state uncertainty clearly.',
    },
    {
      name: 'conservative-cited',
      systemPrompt:
        'Answer using retrieved context only and include brief source-style references. If context is insufficient, refuse politely and ask for clarification.',
    },
  ];

  const tunePromptPayload = {
    topK: promptBenchmark.topK || 5,
    model: MODEL,
    variants: promptVariants,
    samples: promptBenchmark.samples,
  };

  const abTestPayload = {
    topK: promptBenchmark.topK || 5,
    model: MODEL,
    variantA: promptVariants[0],
    variantB: promptVariants[1],
    samples: promptBenchmark.samples,
  };

  const tuneChunkPayload = {
    configs: [
      { chunkSize: 600, overlap: 80 },
      { chunkSize: 900, overlap: 120 },
      { chunkSize: 1200, overlap: 150 },
    ],
    topK: retrievalBenchmark.topK || 5,
    retrievalConfig: retrievalBenchmark.retrievalConfig,
    samples: retrievalBenchmark.samples,
  };

  const client = axios.create({
    timeout: 120000,
  });

  const startedAt = new Date().toISOString();
  const report = {
    startedAt,
    dryRun: DRY_RUN,
    baseUrl: BASE_URL,
    model: MODEL,
    steps: {},
    endedAt: '',
  };

  console.log(`[RAG] start training pipeline | dryRun=${DRY_RUN}`);

  report.steps.ingestBatch = await post(
    client,
    '/ai-rag/pipeline/ingest-batch',
    ingestSeed,
  );
  console.log('[RAG] ingest-batch done');

  report.steps.retrievalBenchmark = await post(
    client,
    '/ai-rag/pipeline/benchmark',
    retrievalBenchmark,
  );
  console.log('[RAG] benchmark done');

  report.steps.tuneChunk = await post(
    client,
    '/ai-rag/pipeline/tune-chunk',
    tuneChunkPayload,
  );
  console.log('[RAG] tune-chunk done');

  report.steps.tunePrompt = await post(
    client,
    '/ai-rag/pipeline/tune-prompt',
    tunePromptPayload,
  );
  console.log('[RAG] tune-prompt done');

  report.steps.abTest = await post(
    client,
    '/ai-rag/pipeline/ab-test',
    abTestPayload,
  );
  console.log('[RAG] ab-test done');

  report.endedAt = new Date().toISOString();

  if (!fs.existsSync(REPORT_DIR)) {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
  }

  const fileName = `rag-training-report-${new Date()
    .toISOString()
    .replace(/[:.]/g, '-')}.json`;
  const filePath = path.join(REPORT_DIR, fileName);

  fs.writeFileSync(filePath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(`[RAG] report written: ${filePath}`);
  if (DRY_RUN) {
    console.log(
      '[RAG] dry-run mode enabled. Set RAG_JWT_TOKEN to run actual API calls.',
    );
  }
}

main().catch((error) => {
  console.error('[RAG] pipeline failed');
  if (error.response) {
    console.error(JSON.stringify(error.response.data, null, 2));
  } else {
    console.error(error.message || String(error));
  }
  process.exit(1);
});
