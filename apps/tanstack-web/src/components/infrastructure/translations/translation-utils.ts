import type {
  FlatTranslation,
  TranslationFilters,
  TranslationMessages,
  TranslationStats,
  TranslationStatus,
} from './types';

export function flattenMessages(
  messages: TranslationMessages,
  prefix = ''
): Record<string, string> {
  return Object.entries(messages).reduce<Record<string, string>>(
    (result, [key, value]) => {
      const nextKey = prefix ? `${prefix}.${key}` : key;

      if (
        typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value)
      ) {
        Object.assign(
          result,
          flattenMessages(value as TranslationMessages, nextKey)
        );
        return result;
      }

      result[nextKey] = String(value);
      return result;
    },
    {}
  );
}

export function buildTranslationRows(
  enMessages: TranslationMessages,
  viMessages: TranslationMessages
): FlatTranslation[] {
  const enFlat = flattenMessages(enMessages);
  const viFlat = flattenMessages(viMessages);
  const keys = new Set([...Object.keys(enFlat), ...Object.keys(viFlat)]);

  return Array.from(keys)
    .map((key) => {
      const enValue = enFlat[key] ?? null;
      const viValue = viFlat[key] ?? null;
      const namespace = key.split('.')[0] || key;
      let status: TranslationStatus = 'complete';

      if (!enValue) {
        status = 'missing-en';
      } else if (!viValue) {
        status = 'missing-vi';
      }

      return {
        enValue,
        key,
        namespace,
        status,
        viValue,
      };
    })
    .sort((left, right) => left.key.localeCompare(right.key));
}

export function filterTranslations(
  rows: FlatTranslation[],
  filters: TranslationFilters
): FlatTranslation[] {
  const query = filters.query.trim().toLowerCase();

  return rows.filter((row) => {
    const matchesQuery =
      query.length === 0 ||
      row.key.toLowerCase().includes(query) ||
      row.enValue?.toLowerCase().includes(query) ||
      row.viValue?.toLowerCase().includes(query);
    const matchesStatus =
      filters.status === 'all' || row.status === filters.status;
    const matchesNamespace =
      filters.namespace === 'all' || row.namespace === filters.namespace;

    return matchesQuery && matchesStatus && matchesNamespace;
  });
}

export function summarizeTranslations(
  rows: FlatTranslation[]
): TranslationStats {
  return rows.reduce<TranslationStats>(
    (stats, row) => {
      stats.total += 1;

      if (row.status === 'complete') {
        stats.complete += 1;
      } else if (row.status === 'missing-en') {
        stats.missingEn += 1;
      } else {
        stats.missingVi += 1;
      }

      return stats;
    },
    {
      complete: 0,
      missingEn: 0,
      missingVi: 0,
      total: 0,
    }
  );
}

function csvCell(value: string | null) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

export function buildTranslationsCsv(rows: FlatTranslation[]) {
  return [
    ['Key', 'English', 'Vietnamese', 'Status'].map(csvCell).join(','),
    ...rows.map((row) =>
      [row.key, row.enValue, row.viValue, row.status].map(csvCell).join(',')
    ),
  ].join('\n');
}

export function buildTranslationsJson(rows: FlatTranslation[]) {
  return JSON.stringify(
    {
      exportDate: new Date().toISOString(),
      totalTranslations: rows.length,
      translations: rows.map((row) => ({
        english: row.enValue,
        key: row.key,
        namespace: row.namespace,
        status: row.status,
        vietnamese: row.viValue,
      })),
    },
    null,
    2
  );
}
