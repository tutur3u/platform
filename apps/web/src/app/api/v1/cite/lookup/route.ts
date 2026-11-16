import { z } from 'zod';
import { reserveCitationLookup } from '@/lib/cite/lookup-budget';
import { lookupCitation } from '@/lib/cite/metadata';
import {
  CitationLookupError,
  readBoundedText,
} from '@/lib/cite/metadata-network';

const inputSchema = z
  .object({ input: z.string().trim().min(1).max(2048) })
  .strict();
const headers = { 'Cache-Control': 'no-store' };

export async function POST(request: Request) {
  try {
    const budget = await reserveCitationLookup(request.headers);
    if (budget.kind === 'rejected') {
      return Response.json(
        {
          error: budget.status === 429 ? 'RATE_LIMITED' : 'LOOKUP_UNAVAILABLE',
        },
        {
          status: budget.status,
          headers: { ...headers, 'Retry-After': String(budget.retryAfter) },
        }
      );
    }
    if (
      request.headers
        .get('content-type')
        ?.split(';')[0]
        ?.trim()
        .toLowerCase() !== 'application/json'
    ) {
      return Response.json(
        { error: 'INVALID_INPUT' },
        { status: 415, headers }
      );
    }
    if (Number(request.headers.get('content-length')) > 4096) {
      return Response.json(
        { error: 'RESPONSE_TOO_LARGE' },
        { status: 413, headers }
      );
    }
    const body = await readBoundedText(
      request.body,
      4096,
      AbortSignal.any([request.signal, AbortSignal.timeout(2000)])
    );
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      return Response.json(
        { error: 'INVALID_INPUT' },
        { status: 400, headers }
      );
    }
    const result = inputSchema.safeParse(parsed);
    if (!result.success)
      return Response.json(
        { error: 'INVALID_INPUT' },
        { status: 400, headers }
      );
    return Response.json(
      await lookupCitation(result.data.input, undefined, request.signal),
      { headers }
    );
  } catch (error) {
    if (error instanceof CitationLookupError) {
      return Response.json(
        { error: error.code },
        { status: error.status, headers }
      );
    }
    return Response.json({ error: 'UPSTREAM_ERROR' }, { status: 502, headers });
  }
}
