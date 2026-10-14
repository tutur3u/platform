import { z } from 'zod';

export const searchableDocumentSchema = z
  .object({
    id: z.string().min(1),
    canonicalId: z.string().min(1),
    contributingIds: z.array(z.string().min(1)).min(1),
    title: z.string(),
    text: z.string().max(131072),
    contentHash: z.string().regex(/^[0-9a-f]{64}$/),
    provenance: z
      .array(
        z
          .object({
            itemId: z.string(),
            source: z.string(),
            firstEventSeq: z.number().int().nonnegative(),
            lastEventSeq: z.number().int().nonnegative(),
            events: z.array(
              z
                .object({
                  seq: z.number().int().nonnegative(),
                  at: z.string(),
                  action: z.string(),
                  payloadHash: z.string().regex(/^[0-9a-f]{64}$/),
                })
                .strict()
            ),
          })
          .strict()
      )
      .min(1),
  })
  .strict();
export type SearchDocument = z.infer<typeof searchableDocumentSchema>;

export function tokenize(text: string): string[] {
  return (
    text
      .replace(/([a-z\d])([A-Z])/g, '$1 $2')
      .normalize('NFKC')
      .toLocaleLowerCase('en')
      .match(/[\p{L}\p{N}]+/gu) ?? []
  );
}

function folded(term: string) {
  return term.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd');
}

export function lexicalSearch(
  documents: readonly SearchDocument[],
  query: string
) {
  const terms = [...new Set(tokenize(query))];
  if (!terms.length) return [];
  const documentFrequency = new Map<string, number>();
  const corpus = documents.map((document) => {
    const tokens = tokenize(
      `${document.id} ${document.title} ${document.text}`
    );
    const exact = new Map<string, number>();
    const normalized = new Map<string, number>();
    for (const token of tokens) {
      exact.set(token, (exact.get(token) ?? 0) + 1);
      const key = folded(token);
      normalized.set(key, (normalized.get(key) ?? 0) + 1);
    }
    for (const key of normalized.keys())
      documentFrequency.set(key, (documentFrequency.get(key) ?? 0) + 1);
    return { document, tokens, exact, normalized };
  });
  const averageLength =
    corpus.reduce((sum, entry) => sum + entry.tokens.length, 0) /
    Math.max(1, corpus.length);
  const results = corpus.map(({ document, tokens, exact, normalized }) => {
    let score = 0;
    for (const term of terms) {
      const key = folded(term);
      const matching = exact.get(term) ?? 0;
      const frequency =
        matching + ((normalized.get(key) ?? 0) - matching) * 0.5;
      if (!frequency) continue;
      const count = documentFrequency.get(key) ?? 0;
      const idf = Math.log(1 + (corpus.length - count + 0.5) / (count + 0.5));
      score +=
        (idf * frequency * 2.2) /
        (frequency +
          1.2 * (0.25 + (0.75 * tokens.length) / Math.max(1, averageLength)));
    }
    if (document.id.toLowerCase() === query.trim().toLowerCase()) score += 10;
    return { id: document.id, score };
  });
  return results
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id, 'en'));
}
