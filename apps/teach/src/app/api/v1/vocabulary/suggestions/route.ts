import * as cheerio from 'cheerio';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

interface OedSuggestion {
  label?: string;
  name?: string;
  path?: string | null;
}

const OED_ORIGIN = 'https://www.oed.com';
const OED_SUGGESTIONS_TIMEOUT_MS = 5_000;

function suggestionUrl(word: string) {
  return `${OED_ORIGIN}/search/dictionary/?scope=Entries&q=${encodeURIComponent(word)}`;
}

function fallbackSuggestion(query: string) {
  return {
    beta: false,
    url: suggestionUrl(query),
    word: query,
  };
}

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
        url: path ? new URL(path, OED_ORIGIN).toString() : suggestionUrl(word),
        word,
      };
    })
    .filter(
      (item): item is { beta: boolean; url: string; word: string } =>
        item !== null
    );
}

function normalizeOedSearchSuggestions(html: string, query: string) {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const suggestions = $('.resultsSetItem')
    .toArray()
    .map((item) => {
      const rawWord =
        $(item).find('.viewEntry').attr('title') ||
        $(item).find('.resultTitle').text() ||
        '';
      const word = rawWord
        .replace(/\s+/gu, ' ')
        .replace(/,\s*[a-z.]+$/iu, '')
        .trim();

      if (!word || seen.has(word.toLowerCase())) return null;
      seen.add(word.toLowerCase());

      return {
        beta: false,
        url: suggestionUrl(word),
        word,
      };
    })
    .filter(
      (item): item is { beta: boolean; url: string; word: string } =>
        item !== null
    )
    .slice(0, 10);

  return suggestions.length > 0 ? suggestions : [fallbackSuggestion(query)];
}

async function loadSearchSuggestions(query: string, signal: AbortSignal) {
  const url = new URL('/search/dictionary/', OED_ORIGIN);
  url.searchParams.set('scope', 'Entries');
  url.searchParams.set('q', query);

  const response = await fetch(url, {
    headers: {
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'en-US,en;q=0.9',
      'user-agent': 'Mozilla/5.0 vocabulary-search-oed',
    },
    next: {
      revalidate: 60 * 60,
    },
    signal,
  });

  if (!response.ok) {
    return [fallbackSuggestion(query)];
  }

  return normalizeOedSearchSuggestions(await response.text(), query);
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
      return NextResponse.json({
        suggestions: await loadSearchSuggestions(query, controller.signal),
      });
    }

    const responseText = await response.text();
    if (!responseText.trim()) {
      return NextResponse.json({
        suggestions: await loadSearchSuggestions(query, controller.signal),
      });
    }

    const suggestions = normalizeSuggestions(JSON.parse(responseText));
    return NextResponse.json({
      suggestions:
        suggestions.length > 0
          ? suggestions
          : await loadSearchSuggestions(query, controller.signal),
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
