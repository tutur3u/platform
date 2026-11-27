const invalidResponse = 'Invalid handbook stats response.';
export const handbookTimezone = 'Asia/Ho_Chi_Minh';

function civilDay(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    return NaN;
  }
  const ms = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(ms) &&
    new Date(ms).toISOString().slice(0, 10) === value
    ? ms / 86_400_000
    : NaN;
}

export function handbookRange(from: string | null, to: string | null) {
  if (!from || !to) return null;
  const days = civilDay(to) - civilDay(from) + 1;
  if (!(days >= 1 && days <= 400)) return null;
  return { from, to, days, query: `from=${from}&to=${to}` };
}

export async function readHandbookRows(
  response: Response,
  range: NonNullable<ReturnType<typeof handbookRange>>
) {
  const maxBytes = 256 * 1024;
  if (
    response.status !== 200 ||
    !response.body ||
    !/^application\/json(?:\s*;|$)/iu.test(
      response.headers.get('content-type') ?? ''
    ) ||
    Number(response.headers.get('content-length')) > maxBytes
  ) {
    await response.body?.cancel().catch(() => {});
    throw new Error(invalidResponse);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0;
  let body = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) throw new Error(invalidResponse);
      body += decoder.decode(value, { stream: true });
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }

  const payload: unknown = JSON.parse(body + decoder.decode());
  if (
    !payload ||
    typeof payload !== 'object' ||
    !('rows' in payload) ||
    !Array.isArray(payload.rows) ||
    payload.rows.length > range.days * 4
  ) {
    throw new Error(invalidResponse);
  }

  const seen = new Set<string>();
  return payload.rows.map((row: unknown) => {
    if (!row || typeof row !== 'object') throw new Error(invalidResponse);
    const { day, lang, event, n } = row as Record<string, unknown>;
    if (
      typeof day !== 'string' ||
      !Number.isFinite(civilDay(day)) ||
      day < range.from ||
      day > range.to ||
      (lang !== 'en' && lang !== 'vi') ||
      (event !== 'view' && event !== 'download') ||
      typeof n !== 'number' ||
      !Number.isInteger(n) ||
      n < 0 ||
      n > 20_000
    ) {
      throw new Error(invalidResponse);
    }
    const bucket = `${day}/${lang}/${event}`;
    if (seen.has(bucket)) throw new Error(invalidResponse);
    seen.add(bucket);
    return { day, lang, event, n };
  });
}
