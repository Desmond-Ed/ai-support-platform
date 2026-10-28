import { Queue, Worker } from 'bullmq';
import { env } from '../config/env.js';
import { KnowledgeDocumentRepository } from '../repositories/KnowledgeDocumentRepository.js';
import { logger } from '../utils/logger.js';
import { redisConnection } from './redisConnection.js';

export const knowledgeIngestionJobOptions = {
  attempts: 4,
  backoff: { type: 'exponential' as const, delay: 30_000 },
};

export const knowledgeIngestionQueue = new Queue('knowledge-ingestion', {
  connection: redisConnection,
});

export function knowledgeIngestionJobId(documentId: string, attempt: number): string {
  return attempt <= 0
    ? `knowledge-document-${documentId}`
    : `knowledge-document-${documentId}-retry-${attempt}`;
}

export async function getKnowledgeIngestionJobState(jobId: string): Promise<string | null> {
  const job = await knowledgeIngestionQueue.getJob(jobId);
  if (!job) return null;
  return job.getState();
}

export function startKnowledgeIngestionWorker(): void {
  new Worker(
    'knowledge-ingestion',
    async (job) => {
      const documentId = String(job.data?.documentId ?? '');
      if (!documentId) {
        throw new Error('Missing documentId for knowledge ingestion');
      }

      const attempt = job.attemptsMade + 1;
      const maxAttempts = job.opts.attempts ?? 1;

      try {
        const response = await fetch(`${env.AI_SERVICE_URL}/api/knowledge/ingest`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ documentId, attempt, maxAttempts }),
          signal: AbortSignal.timeout(30_000),
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(`AI ingestion failed (${response.status}): ${text}`);
        }

        return response.json();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (attempt >= maxAttempts) {
          try {
            await KnowledgeDocumentRepository.markIngestionFailedIfUnfinished(
              documentId,
              errorMessage,
            );
          } catch (updateError) {
            logger.error('Failed to reconcile knowledge ingestion status', {
              documentId,
              error:
                updateError instanceof Error ? updateError.message : String(updateError),
            });
          }
          logger.error('Knowledge ingestion exhausted retries', {
            documentId,
            attempt,
            maxAttempts,
            error: errorMessage,
          });
        }
        throw error;
      }
    },
    { connection: redisConnection },
  );
}
