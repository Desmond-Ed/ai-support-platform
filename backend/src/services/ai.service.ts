import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

export interface AiReply {
  content: string;
  confidence: number | null;
  grounded: boolean | null;
  shouldEscalate: boolean;
}

export async function generateReply(conversationId: string, message: string): Promise<AiReply> {
  try {
    const response = await fetch(`${env.AI_SERVICE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ conversation_id: conversationId, message }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      throw new Error(`AI service returned ${response.status}`);
    }

    const payload = (await response.json()) as {
      content?: unknown;
      confidence?: unknown;
      grounded?: unknown;
      should_escalate?: unknown;
    };

    if (typeof payload.content !== 'string' || payload.content.length === 0) {
      throw new Error('AI service returned an invalid response');
    }

    return {
      content: payload.content,
      confidence: typeof payload.confidence === 'number' ? payload.confidence : null,
      grounded: typeof payload.grounded === 'boolean' ? payload.grounded : null,
      shouldEscalate: payload.should_escalate === true,
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError('AI service unavailable', 503);
  }
}