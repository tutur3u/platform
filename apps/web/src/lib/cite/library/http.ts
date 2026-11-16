import 'server-only';

import { NextResponse } from 'next/server';
import { CitationLookupError, readBoundedText } from '../metadata-network';
import { CitationLibraryError } from './contracts';

export const LIBRARY_RESPONSE_HEADERS = {
  'Cache-Control': 'private, no-store',
};

export async function readLibraryBody(
  request: Request,
  maxBytes = 65536
): Promise<unknown> {
  const mediaType = request.headers
    .get('content-type')
    ?.split(';')[0]
    ?.trim()
    .toLowerCase();
  if (mediaType !== 'application/json')
    throw new CitationLibraryError('INVALID_INPUT', 400);
  try {
    const text = await readBoundedText(
      request.body,
      maxBytes,
      AbortSignal.any([request.signal, AbortSignal.timeout(5000)])
    );
    return JSON.parse(text);
  } catch (error) {
    if (
      error instanceof CitationLookupError &&
      error.code === 'RESPONSE_TOO_LARGE'
    )
      throw new CitationLibraryError('INVALID_INPUT', 413);
    throw new CitationLibraryError('INVALID_INPUT', 400);
  }
}

export function citationLibraryErrorResponse(error: unknown) {
  if (error instanceof CitationLibraryError)
    return NextResponse.json(
      {
        error: error.code,
        ...(error.existingId ? { existingId: error.existingId } : {}),
      },
      { status: error.status, headers: LIBRARY_RESPONSE_HEADERS }
    );
  console.error('cite_library_unavailable');
  return NextResponse.json(
    { error: 'LIBRARY_UNAVAILABLE' },
    { status: 503, headers: LIBRARY_RESPONSE_HEADERS }
  );
}
