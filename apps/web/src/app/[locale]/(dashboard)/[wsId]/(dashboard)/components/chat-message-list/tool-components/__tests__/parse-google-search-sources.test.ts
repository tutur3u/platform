import { describe, expect, it } from 'vitest';
import { parseGoogleSearchSources } from '../parse-google-search-sources';

describe('parseGoogleSearchSources', () => {
  it('returns empty array for null or invalid sources container', () => {
    expect(parseGoogleSearchSources(null)).toEqual([]);
    expect(parseGoogleSearchSources({})).toEqual([]);
    expect(parseGoogleSearchSources({ sources: 'invalid' })).toEqual([]);
  });

  it('filters invalid items and non-http(s) URLs', () => {
    const sources = parseGoogleSearchSources({
      sources: [
        null,
        'text',
        { url: 'javascript:alert(1)', title: 'bad' },
        { url: 'data:text/plain,hi', title: 'bad2' },
        { url: 'https://valid.example.com', title: 'ok' },
      ],
    });

    expect(sources).toEqual([
      {
        sourceId: 'google-search-4',
        url: 'https://valid.example.com',
        title: 'ok',
      },
    ]);
  });

  it('accepts plain http URLs', () => {
    const sources = parseGoogleSearchSources({
      sources: [{ url: 'http://example.com', title: 'HTTP site' }],
    });

    expect(sources).toHaveLength(1);
    expect(sources[0]?.url).toBe('http://example.com');
  });

  it('uses provided sourceId and omits blank title', () => {
    const sources = parseGoogleSearchSources({
      sources: [
        {
          sourceId: 'custom-source',
          url: 'https://example.com/article',
          title: '   ',
        },
      ],
    });

    expect(sources).toEqual([
      {
        sourceId: 'custom-source',
        url: 'https://example.com/article',
      },
    ]);
  });

  it('falls back to generated sourceId when provided sourceId is whitespace', () => {
    const sources = parseGoogleSearchSources({
      sources: [
        {
          sourceId: '   ',
          url: 'https://example.com/source',
          title: 'Source',
        },
      ],
    });

    expect(sources).toEqual([
      {
        sourceId: 'google-search-0',
        url: 'https://example.com/source',
        title: 'Source',
      },
    ]);
  });
});
