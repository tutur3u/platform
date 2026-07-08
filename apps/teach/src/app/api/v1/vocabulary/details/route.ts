import * as cheerio from 'cheerio';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const urlParam = request.nextUrl.searchParams.get('url')?.trim();
  const wordParam = request.nextUrl.searchParams.get('word')?.trim();

  let targetUrl = '';

  if (urlParam) {
    try {
      const parsedUrl = new URL(urlParam);
      if (!parsedUrl.hostname.endsWith('dictionary.cambridge.org')) {
        return NextResponse.json(
          { message: 'Invalid URL. Only Cambridge Dictionary URLs are allowed.' },
          { status: 400 }
        );
      }
      targetUrl = urlParam;
    } catch {
      return NextResponse.json(
        { message: 'Invalid URL format.' },
        { status: 400 }
      );
    }
  } else if (wordParam) {
    if (wordParam.length > 100) {
      return NextResponse.json(
        { message: 'Word is too long.' },
        { status: 400 }
      );
    }
    targetUrl = `https://dictionary.cambridge.org/dictionary/english/${encodeURIComponent(wordParam)}`;
  } else {
    return NextResponse.json(
      { message: 'Either url or word query parameter is required.' },
      { status: 400 }
    );
  }

  try {
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    });

    if (response.status === 404) {
      return NextResponse.json(
        { message: 'Word or entry not found.' },
        { status: 404 }
      );
    }

    if (!response.ok) {
      return NextResponse.json(
        { message: `Failed to fetch from dictionary (status ${response.status}).` },
        { status: 502 }
      );
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
    console.error('Failed to scrape dictionary details:', error);
    return NextResponse.json(
      { message: 'Internal server error while scraping dictionary details.' },
      { status: 500 }
    );
  }
}
