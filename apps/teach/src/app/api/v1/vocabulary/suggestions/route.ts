import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';
import {
  fetchLaban,
  LABAN_ORIGIN,
  LABAN_TIMEOUT_MS,
  labanFindUrl,
  normalizeLabanSuggestions,
  type VocabularySuggestion,
} from '../laban';

function fallbackSuggestion(query: string): VocabularySuggestion[] {
  return [
    {
      beta: false,
      url: labanFindUrl(query),
      word: query,
    },
  ];
}

async function loadVocabularySuggestions(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q')?.trim() ?? '';

  if (query.length < 2) {
    return NextResponse.json({ suggestions: [] });
  }

  if (query.length > 80) {
    return NextResponse.json(
      { message: 'Query must be 80 characters or fewer.' },
      { status: 400 }
    );
  }

  const url = new URL('/ajax/autocomplete', LABAN_ORIGIN);
  url.searchParams.set('type', '1');
  url.searchParams.set('site', 'dictionary');
  url.searchParams.set('query', query);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LABAN_TIMEOUT_MS);

  try {
    const response = await fetchLaban(url, controller.signal);

    if (!response.ok) {
      console.warn('Laban suggestions returned a non-OK response', {
        query,
        status: response.status,
      });
      return NextResponse.json({ suggestions: fallbackSuggestion(query) });
    }

    const responseText = await response.text();
    if (!responseText.trim()) {
      return NextResponse.json({ suggestions: fallbackSuggestion(query) });
    }

    const suggestions = normalizeLabanSuggestions(JSON.parse(responseText));
    return NextResponse.json({
      suggestions:
        suggestions.length > 0 ? suggestions : fallbackSuggestion(query),
    });
  } catch (error) {
    console.warn('Failed to load Laban vocabulary suggestions', {
      error,
      query,
    });
    return NextResponse.json({ suggestions: fallbackSuggestion(query) });
  } finally {
    clearTimeout(timeout);
  }
}

export const GET = withSessionAuth(loadVocabularySuggestions, {
  allowAppSessionAuth: { targetApp: 'teach' },
  rateLimit: { maxRequests: 120, windowMs: 60_000 },
  rateLimitKind: 'read',
});
