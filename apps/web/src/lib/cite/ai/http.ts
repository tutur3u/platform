import 'server-only';

import { NextResponse } from 'next/server';
import { CitationLookupError, readBoundedText } from '../metadata-network';
import { CitationAiError } from './contracts';

export const CITE_AI_HEADERS = { 'Cache-Control': 'private, no-store' };

export async function readCitationFixBody(request: Request) {
  if (
    request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !==
    'application/json'
  )
    throw new CitationAiError('INVALID_INPUT', 400);
  try {
    const text = await readBoundedText(
      request.body,
      96000,
      AbortSignal.any([request.signal, AbortSignal.timeout(5000)])
    );
    return JSON.parse(text);
  } catch (error) {
    if (
      error instanceof CitationLookupError &&
      error.code === 'RESPONSE_TOO_LARGE'
    )
      throw new CitationAiError('INVALID_INPUT', 413);
    throw new CitationAiError('INVALID_INPUT', 400);
  }
}

export function citationAiErrorResponse(error: unknown) {
  if (error instanceof CitationAiError)
    return NextResponse.json(
      {
        error: error.code,
        ...(error.billingStatus ? { billingStatus: error.billingStatus } : {}),
      },
      {
        status: error.status,
        headers: {
          ...CITE_AI_HEADERS,
          ...(error.status === 503 || error.code === 'GENERATION_IN_PROGRESS'
            ? { 'Retry-After': '5' }
            : {}),
        },
      }
    );
  console.error('cite_ai_unavailable');
  return NextResponse.json(
    { error: 'AI_UNAVAILABLE' },
    { status: 503, headers: CITE_AI_HEADERS }
  );
}
