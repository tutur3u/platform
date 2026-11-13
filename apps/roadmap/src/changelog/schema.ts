export type Localized = { en: string; vi: string };
export type Changelog = {
  schema: 1;
  generatedAt: string;
  mode: 'llm' | 'fallback';
  model: string | null;
  releases: Array<{
    id: string;
    sha: string;
    date: string;
    title: Localized;
    summary: Localized;
    products: Array<{
      product: string;
      items: Array<{ text: Localized; prs: number[] }>;
    }>;
  }>;
};

function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error();
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).length !== keys.length ||
    keys.some((k) => !(k in record))
  )
    throw Error();
  return record;
}

export function plainText(value: unknown, cap: number): string {
  if (typeof value !== 'string' || value.length > cap) throw Error();
  const text = value.replace(/[\p{Cc}\p{Cf}]/gu, '').trim();
  if (
    !text ||
    /<[a-z]|javascript:|https?:\/\/|www\.|\b[\p{L}\d-]+(?:\.[\p{L}\d-]+)+\/|!?\[[^\]]*\]\s*(?:\(|\[)/iu.test(
      text
    )
  )
    throw Error();
  return text;
}
function localized(value: unknown, cap: number): Localized {
  const r = object(value, ['en', 'vi']);
  return { en: plainText(r.en, cap), vi: plainText(r.vi, cap) };
}
function array(value: unknown, cap: number): unknown[] {
  if (!Array.isArray(value) || value.length > cap) throw Error();
  return value;
}
function time(value: unknown): string {
  const text = plainText(value, 32);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(text) ||
    !Number.isFinite(Date.parse(text)) ||
    new Date(text).toISOString().replace('.000Z', 'Z') !==
      text.replace('.000Z', 'Z')
  )
    throw Error();
  return text;
}
export function parseChangelog(raw: unknown): Changelog | null {
  try {
    const r = object(raw, [
      'schema',
      'generatedAt',
      'mode',
      'model',
      'releases',
    ]);
    if (r.schema !== 1 || (r.mode !== 'llm' && r.mode !== 'fallback'))
      return null;
    if (
      (r.mode === 'fallback' && r.model !== null) ||
      (r.mode === 'llm' && typeof r.model !== 'string')
    )
      return null;
    return {
      schema: 1,
      generatedAt: time(r.generatedAt),
      mode: r.mode,
      model: r.model === null ? null : plainText(r.model, 100),
      releases: array(r.releases, 10).map((value) => {
        const release = object(value, [
          'id',
          'sha',
          'date',
          'title',
          'summary',
          'products',
        ]);
        const sha = plainText(release.sha, 40);
        if (!/^[a-f0-9]{40}$/.test(sha)) throw Error();
        return {
          id: plainText(release.id, 80),
          sha,
          date: time(release.date),
          title: localized(release.title, 120),
          summary: localized(release.summary, 600),
          products: array(release.products, 64).map((value) => {
            const product = object(value, ['product', 'items']);
            const id = plainText(product.product, 32);
            if (!/^[a-z][a-z0-9-]*$/.test(id)) throw Error();
            return {
              product: id,
              items: array(product.items, 1000).map((value) => {
                const item = object(value, ['text', 'prs']);
                const prs = array(item.prs, 100);
                if (
                  !prs.length ||
                  prs.some(
                    (n) =>
                      typeof n !== 'number' ||
                      !Number.isSafeInteger(n) ||
                      n <= 0
                  )
                )
                  throw Error();
                return {
                  text: localized(item.text, 280),
                  prs: prs as number[],
                };
              }),
            };
          }),
        };
      }),
    };
  } catch {
    return null;
  }
}
