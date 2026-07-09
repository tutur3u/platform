import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

interface CambridgeSuggestion {
  beta?: boolean;
  url?: string;
  word?: string;
}

const CAMBRIDGE_SUGGESTIONS_TIMEOUT_MS = 5_000;

function normalizeSuggestions(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return null;
      }

      const suggestion = item as CambridgeSuggestion;
      const word = suggestion.word?.trim();
      const url = suggestion.url?.trim();

      if (!word) return null;

      return {
        beta: suggestion.beta === true,
        url: url ? `https://dictionary.cambridge.org${url}` : null,
        word,
      };
    })
    .filter(
      (item): item is { beta: boolean; url: string | null; word: string } =>
        item !== null
    );
}

export async function GET(request: NextRequest) {
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

  const url = new URL('https://dictionary.cambridge.org/autocomplete/amp');
  url.searchParams.set('dataset', 'english');
  url.searchParams.set('q', query);
  url.searchParams.set(
    '__amp_source_origin',
    'https://dictionary.cambridge.org'
  );

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    CAMBRIDGE_SUGGESTIONS_TIMEOUT_MS
  );

  try {
    const response = await fetch(url, {
      headers: {
        accept: 'application/json',
        'accept-language': 'en-US,en;q=0.9',
        'user-agent': 'Mozilla/5.0 vocabulary-autocomplete',
      },
      next: {
        revalidate: 60 * 60,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      console.warn('Cambridge suggestions returned a non-OK response', {
        query,
        status: response.status,
      });
      return NextResponse.json({ suggestions: [] });
    }

    return NextResponse.json({
      suggestions: normalizeSuggestions(await response.json()),
    });
  } catch (error) {
    console.warn('Failed to load Cambridge vocabulary suggestions', {
      error,
      query,
    });
    return NextResponse.json({ suggestions: [] });
  } finally {
    clearTimeout(timeout);
  }
}
