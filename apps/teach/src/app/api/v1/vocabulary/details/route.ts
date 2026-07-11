import * as cheerio from 'cheerio';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';

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

function normalizeText(value: string) {
  return value
    .replace(/\s+/gu, ' ')
    .replace(/\u2026/gu, '...')
    .trim();
}

function sanitizeHeadword(value: string, fallback: string) {
  const word = normalizeText(value)
    .replace(/,\s*[a-z.]+$/iu, '')
    .trim();

  return word || fallback;
}

function safeOedUrl(path: string | undefined) {
  const trimmedPath = path?.trim();

  if (!trimmedPath?.startsWith('/') || trimmedPath.startsWith('//')) {
    return null;
  }

  const url = new URL(trimmedPath, OED_ORIGIN);

  return url.origin === OED_ORIGIN ? url : null;
}

async function fetchOedHtml(url: URL, signal: AbortSignal) {
  const response = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 vocabulary-oed',
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
    },
    signal,
  });

  if (!response.ok) return null;

  return response.text();
}

function firstText($: cheerio.CheerioAPI, selectors: string[]) {
  for (const selector of selectors) {
    const text = normalizeText($(selector).first().text());
    if (text) return text;
  }

  return '';
}

function extractEntryDetails(html: string, fallbackWord: string) {
  const $ = cheerio.load(html);
  const word = sanitizeHeadword(
    firstText($, [
      'h1 .hw',
      '.entryHead .hw',
      '.headword',
      '[data-testid="headword"]',
      'h1',
    ]),
    fallbackWord
  );
  const pronunciation = firstText($, [
    '.pronunciation',
    '.pron',
    '.phon',
    '.transcription',
    '[data-testid="pronunciation"]',
  ]);
  const definition = firstText($, [
    '.definition',
    '.def',
    '.sense .def',
    '[data-testid="definition"]',
    '.snippet',
  ]);
  const examples = [
    ...new Set(
      $('.quotationText, .quot, .quote, .example, .x')
        .toArray()
        .map((item) => normalizeText($(item).text()))
        .filter(Boolean)
    ),
  ].slice(0, 5);

  return {
    definition,
    examples,
    pronunciation,
    word,
  };
}

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

  const targetUrl = new URL('/search/dictionary/', OED_ORIGIN);
  targetUrl.searchParams.set('scope', 'Entries');
  targetUrl.searchParams.set('q', wordParam);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      OED_DETAILS_TIMEOUT_MS
    );

    const html = await fetchOedHtml(targetUrl, controller.signal).finally(() =>
      clearTimeout(timeout)
    );

    if (!html) {
      return NextResponse.json(emptyDictionaryDetails(wordParam));
    }

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
    const word = sanitizeHeadword(rawTitle, wordParam);
    const definition = normalizeText($(selected).find('.snippet').text());
    const entryUrl = safeOedUrl($(selected).find('.viewEntry').attr('href'));

    if (entryUrl) {
      const entryController = new AbortController();
      const entryTimeout = setTimeout(
        () => entryController.abort(),
        OED_DETAILS_TIMEOUT_MS
      );
      const entryHtml = await fetchOedHtml(
        entryUrl,
        entryController.signal
      ).finally(() => clearTimeout(entryTimeout));

      if (entryHtml) {
        const entryDetails = extractEntryDetails(entryHtml, word);

        return NextResponse.json({
          word: entryDetails.word || word,
          pronunciation: entryDetails.pronunciation,
          definition: entryDetails.definition || definition,
          examples: entryDetails.examples,
        });
      }
    }

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

export const GET = withSessionAuth(loadVocabularyDetails, {
  allowAppSessionAuth: { targetApp: 'teach' },
  rateLimit: { maxRequests: 60, windowMs: 60_000 },
  rateLimitKind: 'read',
});
