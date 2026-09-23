import { Queue, Worker } from 'bullmq';
import { env } from '../config/env.js';
import { redisConnection } from './redisConnection.js';

export const knowledgeIngestionQueue = new Queue('knowledge-ingestion', {
  connection: redisConnection,
});

export function startKnowledgeIngestionWorker(): void {
  new Worker(
    'knowledge-ingestion',
    async (job) => {
      const documentId = String(job.data?.documentId ?? '');
      if (!documentId) {
        throw new Error('Missing documentId for knowledge ingestion');
      }

      const response = await fetch(`${env.AI_SERVICE_URL}/api/knowledge/ingest`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ documentId }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`AI ingestion failed (${response.status}): ${text}`);
      }

      return response.json();
    },
    { connection: redisConnection },
  );
}
