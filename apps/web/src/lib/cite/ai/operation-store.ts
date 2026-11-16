import 'server-only';

import { createHash } from 'node:crypto';
import { getUpstashRestRedisClient } from '@tuturuuu/utils/upstash-rest';
import { z } from 'zod';
import { boundedCitationOperation } from './timeout';
import {
  CitationAiError,
  type CitationAiOperationStore,
  citationAiOperationSchema,
  CITE_AI_RECEIPT_SECONDS,
} from './contracts';

const claimScript = `
local existing = redis.call('GET', KEYS[1])
if existing then return {0,existing} end
if redis.call('EXISTS', KEYS[2]) == 1 then return {-1,''} end
redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2])
redis.call('SET', KEYS[2], ARGV[3], 'EX', 120)
return {1,ARGV[1]}`;
const transitionScript = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
if redis.call('GET', KEYS[2]) ~= ARGV[4] then return 0 end
redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
if redis.call('GET', KEYS[2]) == ARGV[4] then redis.call('EXPIRE', KEYS[2], ARGV[6]) end
if ARGV[5] == '1' and redis.call('GET', KEYS[2]) == ARGV[4] then redis.call('DEL', KEYS[2]) end
return 1`;
const claimResultSchema = z.tuple([
  z.union([z.literal(-1), z.literal(0), z.literal(1)]),
  z.string(),
]);

function keys(operationId: string, userId: string) {
  const actor = createHash('sha256').update(userId).digest('hex');
  return [
    `cite:ai:{operations}:operation:${operationId}`,
    `cite:ai:{operations}:actor:${actor}:active`,
  ];
}
function encoded(record: unknown) {
  const text = JSON.stringify(citationAiOperationSchema.parse(record));
  if (new TextEncoder().encode(text).byteLength > 96000)
    throw new CitationAiError('AI_UNAVAILABLE', 503);
  return text;
}
function decode(value: unknown) {
  try {
    return citationAiOperationSchema.parse(
      typeof value === 'string' ? JSON.parse(value) : value
    );
  } catch {
    throw new CitationAiError('AI_UNAVAILABLE', 503);
  }
}
async function store() {
  const client = await boundedCitationOperation(
    getUpstashRestRedisClient(),
    5000
  );
  if (!client) throw new CitationAiError('AI_UNAVAILABLE', 503);
  return client;
}

/** Receipts bind global operation IDs to an actor, omit raw prompts, and outlive new-operation acceptance. */
export function createCitationAiOperationStore(): CitationAiOperationStore {
  return {
    async claim(operationId, binding) {
      const record = { stage: 'running', binding } satisfies ReturnType<
        typeof citationAiOperationSchema.parse
      >;
      const client = await store();
      const [status, value] = claimResultSchema.parse(
        await boundedCitationOperation(
          client.eval(claimScript, keys(operationId, binding.userId), [
            encoded(record),
            CITE_AI_RECEIPT_SECONDS,
            operationId,
          ]),
          5000
        )
      );
      if (status === -1)
        throw new CitationAiError('GENERATION_IN_PROGRESS', 409);
      return status === 1
        ? { claimed: true, record: decode(value) }
        : { claimed: false, record: decode(value) };
    },
    async transition(operationId, previous, next, releaseActor = false) {
      const client = await store();
      return (
        (await boundedCitationOperation(
          client.eval(
            transitionScript,
            keys(operationId, previous.binding.userId),
            [
              encoded(previous),
              encoded(next),
              CITE_AI_RECEIPT_SECONDS,
              operationId,
              releaseActor ? '1' : '0',
              next.stage === 'settling' ||
              (next.stage === 'failed' && next.code === 'BILLING_PENDING')
                ? CITE_AI_RECEIPT_SECONDS
                : 120,
            ]
          ),
          5000
        )) === 1
      );
    },
    async read(operationId, userId) {
      const client = await store();
      const value = await boundedCitationOperation(
        client.get(keys(operationId, userId)[0] ?? ''),
        5000
      );
      if (value === null) return null;
      const record = decode(value);
      if (record.binding.userId !== userId)
        throw new CitationAiError('OPERATION_CONFLICT', 409);
      return record;
    },
  };
}
