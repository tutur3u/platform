import * as cheerio from 'cheerio';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const OED_ORIGIN = 'https://www.oed.com';
const OED_DETAILS_TIMEOUT_MS = 5_000;

function emptyDictionaryDetails(word: string) {
  return {
    definition: '',
    examples: [],
    pronunciation: '',
    word,
  };
}

export async function GET(request: NextRequest) {
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

  const targetUrl = new URL('/search/dictionary/', OED_ORIGIN);
  targetUrl.searchParams.set('scope', 'Entries');
  targetUrl.searchParams.set('q', wordParam);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      OED_DETAILS_TIMEOUT_MS
    );

    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 vocabulary-oed',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (response.status === 404) {
      return NextResponse.json(emptyDictionaryDetails(wordParam));
    }

    if (!response.ok) {
      console.warn('OED details returned a non-OK response', {
        status: response.status,
        word: wordParam,
      });
      return NextResponse.json(emptyDictionaryDetails(wordParam));
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const normalizedQuery = wordParam.toLowerCase();
    const resultItems = $('.resultsSetItem').toArray();
    const selected =
      resultItems.find((item) => {
        const title = $(item).find('.resultTitle').text().trim().toLowerCase();
        return title.startsWith(normalizedQuery);
      }) ?? resultItems[0];

    if (!selected) {
      return NextResponse.json(emptyDictionaryDetails(wordParam));
    }

    const rawTitle =
      $(selected).find('.viewEntry').attr('title') ||
      $(selected).find('.resultTitle').text() ||
      wordParam;
    const word = rawTitle
      .replace(/\s+/gu, ' ')
      .replace(/,\s*[a-z.]+$/iu, '')
      .trim();
    const definition = $(selected)
      .find('.snippet')
      .text()
      .replace(/\s+/gu, ' ')
      .replace(/\u2026/gu, '...')
      .trim();

    return NextResponse.json({
      word: word || wordParam,
      pronunciation: '',
      definition,
      examples: [],
    });
  } catch (error) {
    console.warn('Failed to scrape OED dictionary details:', {
      error,
      word: wordParam,
    });
    return NextResponse.json(emptyDictionaryDetails(wordParam));
  }
}
