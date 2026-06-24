import { describe, expect, it, vi } from 'vitest';
import {
  buildTranslationRows,
  buildTranslationsCsv,
  buildTranslationsJson,
  filterTranslations,
  flattenMessages,
  summarizeTranslations,
} from './translation-utils';

describe('translation utilities', () => {
  it('flattens nested message objects into dot-separated keys', () => {
    expect(
      flattenMessages({
        common: {
          save: 'Save',
          steps: ['Draft', 'Review'],
        },
      })
    ).toEqual({
      'common.save': 'Save',
      'common.steps': 'Draft,Review',
    });
  });

  it('builds sorted translation rows and status totals', () => {
    const rows = buildTranslationRows(
      {
        a: 'A',
        b: 'B',
      },
      {
        a: 'Một',
        c: 'C',
      }
    );

    expect(rows).toEqual([
      {
        enValue: 'A',
        key: 'a',
        namespace: 'a',
        status: 'complete',
        viValue: 'Một',
      },
      {
        enValue: 'B',
        key: 'b',
        namespace: 'b',
        status: 'missing-vi',
        viValue: null,
      },
      {
        enValue: null,
        key: 'c',
        namespace: 'c',
        status: 'missing-en',
        viValue: 'C',
      },
    ]);
    expect(summarizeTranslations(rows)).toEqual({
      complete: 1,
      missingEn: 1,
      missingVi: 1,
      total: 3,
    });
  });

  it('filters by namespace, status, and search query', () => {
    const rows = buildTranslationRows(
      {
        common: { save: 'Save' },
        docs: { title: 'Docs' },
      },
      {
        common: { save: 'Lưu' },
      }
    );

    expect(
      filterTranslations(rows, {
        namespace: 'docs',
        query: '',
        status: 'missing-vi',
      }).map((row) => row.key)
    ).toEqual(['docs.title']);
    expect(
      filterTranslations(rows, {
        namespace: 'all',
        query: 'lưu',
        status: 'all',
      }).map((row) => row.key)
    ).toEqual(['common.save']);
  });

  it('exports reviewed rows as CSV and JSON', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-25T00:00:00.000Z'));

    const rows = buildTranslationRows(
      {
        common: { quote: 'A "quote"' },
      },
      {
        common: { quote: 'Trích dẫn' },
      }
    );

    expect(buildTranslationsCsv(rows)).toContain('"A ""quote"""');
    expect(JSON.parse(buildTranslationsJson(rows))).toMatchObject({
      exportDate: '2026-06-25T00:00:00.000Z',
      totalTranslations: 1,
    });

    vi.useRealTimers();
  });
});
