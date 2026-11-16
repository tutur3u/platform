import 'server-only';

import { createHash } from 'node:crypto';
import {
  CiteWorkSchema,
  citationItemSchema,
  citationOccurrenceSchema,
  contributorSchema,
  formatDocument,
  provenanceSchema,
  validateCitation,
} from '@tuturuuu/cite';
import { getUpstashRestRedisClient } from '@tuturuuu/utils/upstash-rest';
import { z } from 'zod';
import { resolveSessionAuthContext } from '@/lib/api-auth';

export const CITE_FORMAT_MAX_BYTES = 96 * 1024;
export const CITE_FORMAT_TIMEOUT_MS = 5000;
export const CITE_FORMAT_ACTOR_LIMIT = 10;
export const CITE_FORMAT_GLOBAL_LIMIT = 120;
const responseHeaders = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
};

const contributors = z
  .array(
    z.union([
      contributorSchema.options[0].strict(),
      contributorSchema.options[1].strict(),
    ])
  )
  .max(100)
  .default([]);
const strictWorkSchema = CiteWorkSchema.strict().extend({
  authors: contributors,
  editors: contributors,
  translators: contributors,
  provenance: provenanceSchema
    .strict()
    .default({ sourceCaptureMethod: 'manual', verificationStatus: 'manual' }),
  legal: CiteWorkSchema.shape.legal.unwrap().strict().optional(),
  aiGenerated: CiteWorkSchema.shape.aiGenerated.unwrap().strict().optional(),
  indigenous: CiteWorkSchema.shape.indigenous.unwrap().strict().optional(),
});
const styleSchema = z.enum(['apa', 'harvard']);
const formatInputSchema = z
  .object({
    style: styleSchema,
    works: z.array(strictWorkSchema).max(100),
    citations: z
      .array(
        citationOccurrenceSchema.strict().extend({
          items: z.array(citationItemSchema.strict()).min(1).max(10),
        })
      )
      .max(200),
  })
  .strict()
  .superRefine((input, context) => {
    const workIds = new Set(input.works.map(({ id }) => id));
    if (
      workIds.size !== input.works.length ||
      new Set(input.citations.map(({ id }) => id)).size !==
        input.citations.length
    )
      context.addIssue({
        code: 'custom',
        message: 'Duplicate citation identity',
      });
    for (const citation of input.citations)
      if (citation.items.some(({ workId }) => !workIds.has(workId)))
        context.addIssue({ code: 'custom', message: 'Unknown citation work' });
  });
const validateInputSchema = z
  .object({ style: styleSchema, work: strictWorkSchema })
  .strict();

type ActorResolution =
  | { ok: true; actorId: string }
  | { ok: false; response: Response };
type BudgetResult =
  | { kind: 'allowed' }
  | { kind: 'rejected'; status: 429 | 503; retryAfter: number };
type BudgetStore = {
  eval(
    script: string,
    keys: string[],
    args: (string | number)[]
  ): Promise<unknown>;
};
type Dependencies = {
  authenticate?: (request: Request) => Promise<ActorResolution>;
  reserve?: (actorId: string) => Promise<BudgetResult>;
  format?: typeof formatDocument;
  validate?: typeof validateCitation;
};

async function authenticateActor(request: Request): Promise<ActorResolution> {
  const result = await resolveSessionAuthContext(request);
  return result.ok ? { ok: true, actorId: result.user.id } : result;
}

const reserveScript = `
local actor = tonumber(redis.call('GET', KEYS[1]) or '0')
local total = tonumber(redis.call('GET', KEYS[2]) or '0')
if actor >= tonumber(ARGV[1]) or total >= tonumber(ARGV[2]) then return 0 end
redis.call('INCR', KEYS[1])
redis.call('INCR', KEYS[2])
redis.call('EXPIRE', KEYS[1], ARGV[3])
redis.call('EXPIRE', KEYS[2], ARGV[3])
return 1`;

/** Both deterministic endpoints share the verified actor and global CPU budget. */
export async function reserveCitationFormatting(
  actorId: string,
  dependencies: {
    store?: () => Promise<BudgetStore | null>;
    now?: () => number;
  } = {}
): Promise<BudgetResult> {
  if (!actorId) return { kind: 'rejected', status: 503, retryAfter: 60 };
  const now = (dependencies.now ?? Date.now)();
  const minute = Math.floor(now / 60_000);
  const retryAfter = Math.max(1, 60 - Math.floor((now % 60_000) / 1000));
  const actor = createHash('sha256').update(actorId).digest('hex');
  try {
    const store = await (dependencies.store ?? getUpstashRestRedisClient)();
    if (!store) return { kind: 'rejected', status: 503, retryAfter: 60 };
    const result = await store.eval(
      reserveScript,
      [
        `cite:format:{budget}:${minute}:actor:${actor}`,
        `cite:format:{budget}:${minute}:global`,
      ],
      [CITE_FORMAT_ACTOR_LIMIT, CITE_FORMAT_GLOBAL_LIMIT, 120]
    );
    return result === 1
      ? { kind: 'allowed' }
      : { kind: 'rejected', status: 429, retryAfter };
  } catch {
    return { kind: 'rejected', status: 503, retryAfter: 60 };
  }
}

class CitationRequestError extends Error {
  constructor(
    readonly code:
      | 'INVALID_INPUT'
      | 'REQUEST_TOO_LARGE'
      | 'TIMEOUT'
      | 'REQUEST_ABORTED',
    readonly status: number
  ) {
    super(code);
  }
}

async function readJson(request: Request): Promise<unknown> {
  if (
    request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !==
    'application/json'
  )
    throw new CitationRequestError('INVALID_INPUT', 415);
  const length = request.headers.get('content-length');
  if (
    length !== null &&
    (!/^\d+$/.test(length) || !Number.isSafeInteger(Number(length)))
  )
    throw new CitationRequestError('INVALID_INPUT', 400);
  if (length !== null && Number(length) > CITE_FORMAT_MAX_BYTES)
    throw new CitationRequestError('REQUEST_TOO_LARGE', 413);
  if (request.signal.aborted)
    throw new CitationRequestError('REQUEST_ABORTED', 408);
  if (!request.body) throw new CitationRequestError('INVALID_INPUT', 400);
  const reader = request.body.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort = () => {};
  const stopped = new Promise<never>((_, reject) => {
    onAbort = () => reject(new CitationRequestError('REQUEST_ABORTED', 408));
    request.signal.addEventListener('abort', onAbort, { once: true });
    timer = setTimeout(
      () => reject(new CitationRequestError('TIMEOUT', 408)),
      CITE_FORMAT_TIMEOUT_MS
    );
    if (request.signal.aborted) onAbort();
  });
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0;
  let body = '';
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), stopped]);
      if (done) break;
      bytes += value.byteLength;
      if (bytes > CITE_FORMAT_MAX_BYTES)
        throw new CitationRequestError('REQUEST_TOO_LARGE', 413);
      body += decoder.decode(value, { stream: true });
    }
    if (request.signal.aborted)
      throw new CitationRequestError('REQUEST_ABORTED', 408);
    return JSON.parse(body + decoder.decode());
  } catch (error) {
    if (error instanceof CitationRequestError) throw error;
    throw new CitationRequestError('INVALID_INPUT', 400);
  } finally {
    clearTimeout(timer);
    request.signal.removeEventListener('abort', onAbort);
    void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

async function handle(
  request: Request,
  mode: 'format' | 'validate',
  dependencies: Dependencies
): Promise<Response> {
  try {
    if (request.signal.aborted)
      throw new CitationRequestError('REQUEST_ABORTED', 408);
    const actor = await (dependencies.authenticate ?? authenticateActor)(
      request
    );
    if (!actor.ok) {
      for (const [name, value] of Object.entries(responseHeaders))
        actor.response.headers.set(name, value);
      return actor.response;
    }
    const budget = await (dependencies.reserve ?? reserveCitationFormatting)(
      actor.actorId
    );
    if (budget.kind === 'rejected')
      return Response.json(
        {
          error: budget.status === 429 ? 'RATE_LIMITED' : 'FORMAT_UNAVAILABLE',
        },
        {
          status: budget.status,
          headers: {
            ...responseHeaders,
            'Retry-After': String(budget.retryAfter),
          },
        }
      );
    const input = await readJson(request);
    if (mode === 'format') {
      const parsed = formatInputSchema.safeParse(input);
      if (!parsed.success) throw new CitationRequestError('INVALID_INPUT', 400);
      return Response.json(
        (dependencies.format ?? formatDocument)(parsed.data),
        { headers: responseHeaders }
      );
    }
    const parsed = validateInputSchema.safeParse(input);
    if (!parsed.success) throw new CitationRequestError('INVALID_INPUT', 400);
    return Response.json(
      {
        issues: (dependencies.validate ?? validateCitation)(
          parsed.data.work,
          parsed.data.style
        ),
      },
      { headers: responseHeaders }
    );
  } catch (error) {
    if (error instanceof CitationRequestError)
      return Response.json(
        { error: error.code },
        { status: error.status, headers: responseHeaders }
      );
    return Response.json(
      { error: 'FORMAT_UNAVAILABLE' },
      { status: 503, headers: { ...responseHeaders, 'Retry-After': '60' } }
    );
  }
}

export function handleCitationFormat(
  request: Request,
  dependencies: Dependencies = {}
) {
  return handle(request, 'format', dependencies);
}
export function handleCitationValidate(
  request: Request,
  dependencies: Dependencies = {}
) {
  return handle(request, 'validate', dependencies);
}
