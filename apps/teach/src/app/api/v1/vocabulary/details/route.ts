import * as cheerio from 'cheerio';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const CAMBRIDGE_ORIGIN = 'https://dictionary.cambridge.org';
const CAMBRIDGE_DETAILS_TIMEOUT_MS = 5_000;

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

  let targetUrl = '';

  if (wordParam) {
    if (wordParam.length > 100) {
      return NextResponse.json(
        { message: 'Word is too long.' },
        { status: 400 }
      );
    }
    targetUrl = `${CAMBRIDGE_ORIGIN}/dictionary/english/${encodeURIComponent(wordParam)}`;
  } else {
    return NextResponse.json(
      { message: 'Word query parameter is required.' },
      { status: 400 }
    );
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      CAMBRIDGE_DETAILS_TIMEOUT_MS
    );

    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
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
      console.warn('Cambridge details returned a non-OK response', {
        status: response.status,
        word: wordParam,
      });
      return NextResponse.json(emptyDictionaryDetails(wordParam));
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // 1. Extract Pronunciations
    const ukIpa = $('.uk.dpron-i .ipa').first().text().trim();
    const usIpa = $('.us.dpron-i .ipa').first().text().trim();

    let pronunciation = '';
    if (ukIpa && usIpa) {
      if (ukIpa === usIpa) {
        pronunciation = `/${ukIpa}/`;
      } else {
        pronunciation = `UK: /${ukIpa}/ • US: /${usIpa}/`;
      }
    } else if (ukIpa) {
      pronunciation = `/${ukIpa}/`;
    } else if (usIpa) {
      pronunciation = `/${usIpa}/`;
    }

    // 2. Extract Definitions
    const definitions: string[] = [];
    $('.def.ddef_d').each((_i, el) => {
      const text = $(el).text().trim().replace(/:$/, '').trim();
      if (text) {
        definitions.push(text);
      }
    });

    const definition = definitions[0] ?? '';

    // 3. Extract Examples
    const examples: string[] = [];
    $('.examp.dexamp').each((_i, el) => {
      const text = $(el).text().trim();
      if (text) {
        examples.push(text);
      }
    });

    // Limit to top 5 examples
    const topExamples = examples.slice(0, 5);

    return NextResponse.json({
      word: wordParam || $('.hw.dhw').first().text().trim() || '',
      pronunciation,
      definition,
      examples: topExamples,
    });
  } catch (error) {
    console.warn('Failed to scrape dictionary details:', {
      error,
      word: wordParam,
    });
    return NextResponse.json(emptyDictionaryDetails(wordParam));
  }
}
