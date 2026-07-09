import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

interface OedSuggestion {
  label?: string;
  name?: string;
  path?: string | null;
}

const OED_ORIGIN = 'https://www.oed.com';
const OED_SUGGESTIONS_TIMEOUT_MS = 5_000;

function normalizeSuggestions(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return null;
      }

      const suggestion = item as OedSuggestion;
      const word = (suggestion.label || suggestion.name || '').trim();
      const path = suggestion.path?.trim();

      if (!word) return null;

      return {
        beta: false,
        url: path
          ? new URL(path, OED_ORIGIN).toString()
          : `${OED_ORIGIN}/search/dictionary/?scope=Entries&q=${encodeURIComponent(word)}`,
        word,
      };
    })
    .filter(
      (item): item is { beta: boolean; url: string; word: string } =>
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

  const url = new URL('/autocomplete/dictionary/', OED_ORIGIN);
  url.searchParams.set('q', query);

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    OED_SUGGESTIONS_TIMEOUT_MS
  );

  try {
    const response = await fetch(url, {
      headers: {
        accept: 'application/json',
        'accept-language': 'en-US,en;q=0.9',
        'user-agent': 'Mozilla/5.0 vocabulary-autocomplete-oed',
      },
      next: {
        revalidate: 60 * 60,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      console.warn('OED suggestions returned a non-OK response', {
        query,
        status: response.status,
      });
      return NextResponse.json({ suggestions: [] });
    }

    return NextResponse.json({
      suggestions: normalizeSuggestions(await response.json()),
    });
  } catch (error) {
    console.warn('Failed to load OED vocabulary suggestions', {
      error,
      query,
    });
    return NextResponse.json({ suggestions: [] });
  } finally {
    clearTimeout(timeout);
  }
}
