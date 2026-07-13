import * as cheerio from 'cheerio';

export interface DictionaryDetails {
  definition: string;
  examples: string[];
  pronunciation: string;
  word: string;
}

export interface VocabularySuggestion {
  beta: boolean;
  definition?: string;
  pronunciation?: string;
  url: string;
  word: string;
}

export const LABAN_ORIGIN = 'https://dict.laban.vn';
export const LABAN_TIMEOUT_MS = 5_000;
type NextFetchRequestInit = RequestInit & {
  next?: {
    revalidate?: number;
  };
};

export function emptyDictionaryDetails(word: string): DictionaryDetails {
  return {
    definition: '',
    examples: [],
    pronunciation: '',
    word,
  };
}

export function normalizeText(value: string) {
  return value
    .replace(/\u00a0/gu, ' ')
    .replace(/\s+/gu, ' ')
    .replace(/\u2026/gu, '...')
    .trim();
}

export function labanFindUrl(word: string) {
  const url = new URL('/find', LABAN_ORIGIN);
  url.searchParams.set('type', '1');
  url.searchParams.set('query', word);
  return url.toString();
}

function safeLabanUrl(path: unknown, fallbackWord: string) {
  const trimmedPath = typeof path === 'string' ? path.trim() : '';

  if (!trimmedPath || trimmedPath.startsWith('//')) {
    return labanFindUrl(fallbackWord);
  }

  if (
    !trimmedPath.startsWith('/') &&
    !trimmedPath.startsWith('http://') &&
    !trimmedPath.startsWith('https://')
  ) {
    return labanFindUrl(fallbackWord);
  }

  try {
    const url = new URL(trimmedPath, LABAN_ORIGIN);

    return url.origin === LABAN_ORIGIN
      ? url.toString()
      : labanFindUrl(fallbackWord);
  } catch {
    return labanFindUrl(fallbackWord);
  }
}

function extractSuggestionPreview(
  html: string
): Pick<VocabularySuggestion, 'definition'> & { pronunciation: string } {
  const $ = cheerio.load(html);
  const pronunciationElement = $('.fr').first().clone();
  pronunciationElement.find('img').remove();

  return {
    pronunciation: normalizeText(pronunciationElement.text()),
    definition: normalizeText($('p').first().text()) || undefined,
  };
}

export function normalizeLabanSuggestions(payload: unknown) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return [] satisfies VocabularySuggestion[];
  }

  const rawSuggestions = (payload as { suggestions?: unknown }).suggestions;
  if (!Array.isArray(rawSuggestions)) {
    return [] satisfies VocabularySuggestion[];
  }

  return rawSuggestions
    .map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return null;
      }

      const suggestion = item as Record<string, unknown>;
      const data = typeof suggestion.data === 'string' ? suggestion.data : '';
      const select =
        typeof suggestion.select === 'string' ? suggestion.select : '';
      const preview = data
        ? extractSuggestionPreview(data)
        : { definition: undefined, pronunciation: '' };
      const fallbackWord = normalizeText(select);
      const word =
        fallbackWord || normalizeText(cheerio.load(data)('.fl').first().text());

      if (!word) return null;

      return {
        beta: false,
        ...(preview.definition ? { definition: preview.definition } : {}),
        ...(preview.pronunciation
          ? { pronunciation: preview.pronunciation }
          : {}),
        url: safeLabanUrl(suggestion.link, word),
        word,
      };
    })
    .filter((item): item is VocabularySuggestion => item !== null);
}

export async function fetchLaban(url: URL, signal: AbortSignal) {
  const options: NextFetchRequestInit = {
    headers: {
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7',
      'Accept-Language': 'en-US,en;q=0.9,vi;q=0.8',
      Referer: LABAN_ORIGIN,
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36 vocabulary-laban',
    },
    next: {
      revalidate: 60 * 60,
    },
    signal,
  };

  return fetch(url, options);
}

function extractPrimaryDefinitions(
  $: cheerio.CheerioAPI,
  $content: cheerio.Cheerio<any>
) {
  const definitions: string[] = [];

  $content.children().each((_index: number, element: any) => {
    const node = $(element as any);

    if (node.is('.bold.dot-blue')) {
      return false;
    }

    if (!node.is('.green.bold.margin25, .grey.bold.margin25')) {
      return undefined;
    }

    const text = normalizeText(node.text());
    if (text && !definitions.includes(text)) {
      definitions.push(text);
    }

    return undefined;
  });

  return definitions;
}

export function extractLabanDetails(html: string, fallbackWord: string) {
  const $ = cheerio.load(html);
  const title = $('.word_tab_title_0 h2').first().clone();
  title.find('span').remove();

  const word = normalizeText(title.text()) || fallbackWord;
  const pronunciation = normalizeText(
    $('.word_tab_title_0 .color-black').first().text()
  );
  const content = $('.slide_content[rel="0"] .content').first();

  if (!content.length) {
    return emptyDictionaryDetails(word);
  }

  const partOfSpeech = normalizeText(
    content.find('.bg-grey.bold.font-large span').first().text()
  );
  const definitions = extractPrimaryDefinitions($, content);
  const definitionText = definitions.slice(0, 2).join('; ');
  const definition =
    partOfSpeech && definitionText
      ? `${partOfSpeech}: ${definitionText}`
      : definitionText;
  const exampleCandidates: string[] = content
    .find('.color-light-blue.margin25')
    .toArray()
    .map((element: any): string => normalizeText($(element).text()))
    .filter((value: string) => value.length > 0);
  const examples = Array.from(new Set(exampleCandidates)).slice(0, 5);

  return {
    definition,
    examples,
    pronunciation,
    word,
  } satisfies DictionaryDetails;
}
