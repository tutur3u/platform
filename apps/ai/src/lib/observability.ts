export const AI_STUDIO_MAX_RANGE_MS = 366 * 24 * 60 * 60 * 1000;

export function parseAiStudioDateRange(url: URL) {
  const now = new Date();
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
  );
  const from = new Date(
    url.searchParams.get('from') ?? monthStart.toISOString()
  );
  const to = new Date(url.searchParams.get('to') ?? now.toISOString());

  if (
    Number.isNaN(from.getTime()) ||
    Number.isNaN(to.getTime()) ||
    to <= from ||
    to.getTime() - from.getTime() > AI_STUDIO_MAX_RANGE_MS
  ) {
    return null;
  }

  return { from, to };
}

export function numberValue(value: number | string | null | undefined) {
  return Number(value ?? 0);
}
