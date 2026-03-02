import { isValidHttpUrl } from '@tuturuuu/utils/format';

export interface ParsedGoogleSearchSource {
  sourceId: string;
  url: string;
  title?: string;
}

function isParsedGoogleSearchSource(
  value: ParsedGoogleSearchSource | null
): value is ParsedGoogleSearchSource {
  return value !== null;
}

export function parseGoogleSearchSources(
  outputRecord: Record<string, unknown> | null
): ParsedGoogleSearchSource[] {
  if (!Array.isArray(outputRecord?.sources)) return [];

  return outputRecord.sources
    .map((item, index) => {
      if (!item || typeof item !== 'object') return null;
      const source = item as Record<string, unknown>;
      const url = typeof source.url === 'string' ? source.url.trim() : '';
      if (!url || !isValidHttpUrl(url)) return null;

      const title =
        typeof source.title === 'string' ? source.title.trim() : undefined;
      const sourceId =
        typeof source.sourceId === 'string' && source.sourceId.trim().length > 0
          ? source.sourceId.trim()
          : `google-search-${index}`;

      return {
        sourceId,
        url,
        ...(title ? { title } : {}),
      };
    })
    .filter(isParsedGoogleSearchSource);
}
