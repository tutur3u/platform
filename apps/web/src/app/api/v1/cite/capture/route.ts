import { z } from 'zod';
import { reserveCitationLookup } from '@/lib/cite/lookup-budget';
import { captureCitation } from '@/lib/cite/capture';
import { recognizeCaptureSource } from '@/lib/cite/source-resolver';
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
    // Page capture is withheld while only the per-instance budget is available;
    // identifier lookups (DOI, ISBN, arXiv, PubMed, title) keep working.
    if (
      'fallback' in budget &&
      budget.fallback &&
      recognizeCaptureSource(result.data.input).kind === 'url'
    ) {
      return Response.json(
        { error: 'LOOKUP_UNAVAILABLE' },
        { status: 503, headers: { ...headers, 'Retry-After': '60' } }
      );
    }
    return Response.json(
      await captureCitation(result.data.input, { signal: request.signal }),
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
