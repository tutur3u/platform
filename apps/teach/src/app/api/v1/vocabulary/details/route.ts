import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';
import {
  emptyDictionaryDetails,
  extractLabanDetails,
  fetchLaban,
  LABAN_TIMEOUT_MS,
  labanFindUrl,
} from '../laban';

async function loadVocabularyDetails(request: NextRequest) {
  const wordParam = request.nextUrl.searchParams.get('word')?.trim();

  if (wordParam) {
    if (wordParam.length > 100) {
      return NextResponse.json(
        { message: 'Word is too long.' },
        { status: 400 }
      );
    }
  } else {
    return NextResponse.json(
      { message: 'Word query parameter is required.' },
      { status: 400 }
    );
  }

  const targetUrl = new URL(labanFindUrl(wordParam));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LABAN_TIMEOUT_MS);

  try {
    const response = await fetchLaban(targetUrl, controller.signal, 3600);

    if (!response.ok) {
      return NextResponse.json(emptyDictionaryDetails(wordParam));
    }

    const html = await response.text();
    return NextResponse.json(extractLabanDetails(html, wordParam));
  } catch (error) {
    console.warn('Failed to scrape Laban dictionary details:', {
      error,
      word: wordParam,
    });
    return NextResponse.json(emptyDictionaryDetails(wordParam));
  } finally {
    clearTimeout(timeout);
  }
}

export const GET = withSessionAuth(loadVocabularyDetails, {
  allowAppSessionAuth: { targetApp: 'teach' },
  rateLimit: { maxRequests: 60, windowMs: 60_000 },
  rateLimitKind: 'read',
});
