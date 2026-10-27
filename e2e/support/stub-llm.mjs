import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

// Deterministic OpenAI-compatible provider boundary used only by the isolated
// E2E stack. It exercises the real AI service, retrieval, grounding, Node
// persistence, and Socket.IO delivery without paid provider credentials.
const PORT = Number(process.env.PORT || 8080);
const EMBEDDING_DIMENSIONS = 1536;
const GROUNDED_ANSWER = 'Refunds are processed within 5 business days.';
let failEmbeddingInputCount = 0;

function lexicalEmbedding(input) {
  const vector = Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0);
  const values = Array.isArray(input) ? input.flat(Infinity) : [input];
  for (const value of values) {
    const token = typeof value === 'number' ? value : Number(value);
    if (Number.isFinite(token)) {
      vector[Math.abs(token) % EMBEDDING_DIMENSIONS] += 1;
    } else {
      for (const character of String(value)) {
        vector[character.codePointAt(0) % EMBEDDING_DIMENSIONS] += 1;
      }
    }
  }
  if (vector.every((value) => value === 0)) vector[0] = 1;
  return vector;
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
    });
    request.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    request.on('error', reject);
  });
}

function send(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(body),
  });
  response.end(body);
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);

  if (request.method === 'GET' && url.pathname === '/health') {
    send(response, 200, { status: 'ok' });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/control/fail-embeddings') {
    const payload = await readJson(request);
    failEmbeddingInputCount =
      payload.fail === false ? 0 : Number(payload.inputCount ?? 0);
    send(response, 200, { failEmbeddingInputCount });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/v1/embeddings') {
    const payload = await readJson(request);
    const inputs = Array.isArray(payload.input) ? payload.input : [payload.input ?? ''];
    if (failEmbeddingInputCount > 0 && inputs.length === failEmbeddingInputCount) {
      send(response, 500, {
        error: { message: 'simulated embedding failure', type: 'server_error' },
      });
      return;
    }
    send(response, 200, {
      object: 'list',
      data: inputs.map((input, index) => ({
        object: 'embedding',
        index,
        embedding: lexicalEmbedding(input),
      })),
      model: 'text-embedding-3-small',
      usage: { prompt_tokens: 1, total_tokens: 1 },
    });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/v1/chat/completions') {
    const payload = await readJson(request);
    const messages = Array.isArray(payload.messages) ? payload.messages : [];
    const lastUser = [...messages].reverse().find((message) => message.role === 'user');
    const userContent =
      typeof lastUser?.content === 'string' ? lastUser.content : JSON.stringify(lastUser?.content ?? '');

    if (userContent.includes('SIMULATE_AI_OUTAGE')) {
      send(response, 500, {
        error: { message: 'simulated provider outage', type: 'server_error' },
      });
      return;
    }

    send(response, 200, {
      id: `chatcmpl-${randomUUID()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: 'deepseek-chat',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: GROUNDED_ANSWER },
          finish_reason: 'stop',
        },
      ],
      usage: { prompt_tokens: 24, completion_tokens: 9, total_tokens: 33 },
    });
    return;
  }

  send(response, 404, { error: { message: 'not found' } });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Deterministic LLM/embedding stub listening on ${PORT}`);
});
