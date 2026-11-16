import {
  type CiteWork,
  CiteWorkSchema,
  issuedYear,
  normalizeDoi,
  normalizeIsbn,
} from './model';

const TRACKING_PARAMETERS = /^(?:utm_.+|fbclid|gclid|msclkid|mc_cid|mc_eid)$/i;
const normalizedText = (value: string) =>
  value
    .normalize('NFKC')
    .toLocaleLowerCase('en')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

export function canonicalizeSourceUrl(value: string): string {
  const url = new URL(value);
  url.hash = '';
  for (const key of [...url.searchParams.keys()])
    if (TRACKING_PARAMETERS.test(key)) url.searchParams.delete(key);
  url.searchParams.sort();
  return url.toString();
}

function isbn13(value: string) {
  const isbn = normalizeIsbn(value);
  if (isbn.length !== 10) return isbn;
  const prefix = `978${isbn.slice(0, 9)}`;
  const sum = [...prefix].reduce(
    (total, character, index) =>
      total + Number(character) * (index % 2 ? 3 : 1),
    0
  );
  return `${prefix}${(10 - (sum % 10)) % 10}`;
}

export function hardMatchKeys(work: CiteWork): string[] {
  return [
    ...(work.doi ? [`doi:${normalizeDoi(work.doi)}`] : []),
    ...(work.arxivId
      ? [`arxiv:${work.arxivId.replace(/v\d+$/i, '').toLowerCase()}`]
      : []),
    ...(work.pmid ? [`pmid:${work.pmid}`] : []),
    ...(work.isbn && ['book', 'edited-book'].includes(work.type)
      ? [`isbn:${isbn13(work.isbn)}`]
      : []),
    ...(work.url
      ? [
          `url:${JSON.stringify([canonicalizeSourceUrl(work.url), work.type, normalizedText(work.title)])}`,
        ]
      : []),
  ];
}

function strongIdentifiers(work: CiteWork) {
  return [
    work.doi ? normalizeDoi(work.doi) : undefined,
    work.pmid,
    work.arxivId?.replace(/v\d+$/i, '').toLowerCase(),
  ];
}

export function haveConflictingCitationIdentifiers(
  left: CiteWork,
  right: CiteWork
): boolean {
  const other = strongIdentifiers(right);
  return strongIdentifiers(left).some(
    (identifier, index) =>
      identifier !== undefined &&
      other[index] !== undefined &&
      identifier !== other[index]
  );
}

/** Missing registry IDs cannot bridge two contradictory registry identities. */
export function citationIdentityGroupIsCompatible(
  works: readonly CiteWork[]
): boolean {
  const values = [new Set<string>(), new Set<string>(), new Set<string>()];
  for (const work of works)
    for (const [index, identifier] of strongIdentifiers(work).entries()) {
      if (identifier === undefined) continue;
      const seen = values[index];
      if (!seen) continue;
      seen.add(identifier);
      if (seen.size > 1) return false;
    }
  return true;
}

/** An ambiguous shared identifier is review evidence, never an automatic union. */
export function ambiguousCitationIdentityKeys(
  works: readonly CiteWork[]
): Set<string> {
  const owners = new Map<string, CiteWork[]>();
  for (const work of works)
    for (const key of hardMatchKeys(work)) {
      const existing = owners.get(key);
      if (existing) existing.push(work);
      else owners.set(key, [work]);
    }
  return new Set(
    [...owners]
      .filter(([, members]) => !citationIdentityGroupIsCompatible(members))
      .map(([key]) => key)
  );
}

function firstAuthor(work: CiteWork) {
  const author = work.authors[0] ?? work.editors[0];
  return author
    ? normalizedText(author.kind === 'person' ? author.family : author.name)
    : '';
}

export function canonicalWorkKey(work: CiteWork): string {
  return (
    hardMatchKeys(work)[0] ??
    JSON.stringify([
      work.type,
      normalizedText(work.title),
      [work.authors, work.editors, work.translators].map((contributors) =>
        contributors.map((author) =>
          author.kind === 'person'
            ? [
                normalizedText(author.family),
                normalizedText(author.given ?? ''),
                normalizedText(author.middle ?? ''),
              ]
            : [normalizedText(author.name)]
        )
      ),
      work.issued ?? null,
      work.edition ?? null,
      work.isbn ? isbn13(work.isbn) : null,
      work.publisher ? normalizedText(work.publisher) : null,
      work.publisherPlace ? normalizedText(work.publisherPlace) : null,
      work.containerTitle ? normalizedText(work.containerTitle) : null,
      work.volume ?? null,
      work.issue ?? null,
      work.pages ?? null,
    ])
  );
}

export async function fingerprintWork(work: CiteWork): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(canonicalWorkKey(work))
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function jaroWinkler(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const distance = Math.max(
    0,
    Math.floor(Math.max(a.length, b.length) / 2) - 1
  );
  const am = Array<boolean>(a.length).fill(false);
  const bm = Array<boolean>(b.length).fill(false);
  const positions = new Map<string, { indices: number[]; cursor: number }>();
  for (let j = 0; j < b.length; j += 1) {
    const character = b[j] ?? '';
    const found = positions.get(character);
    if (found) found.indices.push(j);
    else positions.set(character, { indices: [j], cursor: 0 });
  }
  let matches = 0;
  for (let i = 0; i < a.length; i += 1) {
    const found = positions.get(a[i] ?? '');
    if (!found) continue;
    const lower = Math.max(0, i - distance);
    while (
      found.cursor < found.indices.length &&
      (found.indices[found.cursor] ?? 0) < lower
    )
      found.cursor += 1;
    const j = found.indices[found.cursor];
    if (j === undefined || j >= Math.min(b.length, i + distance + 1)) continue;
    am[i] = true;
    bm[j] = true;
    found.cursor += 1;
    matches += 1;
  }
  if (!matches) return 0;
  const left = [...a].filter((_, i) => am[i]);
  const right = [...b].filter((_, i) => bm[i]);
  const transpositions = left.filter((c, i) => c !== right[i]).length / 2;
  const jaro =
    (matches / a.length +
      matches / b.length +
      (matches - transpositions) / matches) /
    3;
  let prefix = 0;
  while (prefix < Math.min(4, a.length, b.length) && a[prefix] === b[prefix])
    prefix += 1;
  return jaro > 0.7 ? jaro + prefix * 0.1 * (1 - jaro) : jaro;
}

function titleJaccard(a: string, b: string): number {
  const left = new Set(a.split(' '));
  const right = new Set(b.split(' '));
  const union = new Set([...left, ...right]);
  return (
    [...left].filter((word) => right.has(word)).length / Math.max(1, union.size)
  );
}

export function citationSimilarity(a: CiteWork, b: CiteWork): number {
  if (haveConflictingCitationIdentifiers(a, b)) return 0;
  const ay = issuedYear(a);
  const by = issuedYear(b);
  if (
    !firstAuthor(a) ||
    firstAuthor(a) !== firstAuthor(b) ||
    ay === undefined ||
    by === undefined ||
    Math.abs(ay - by) > 1
  )
    return 0;
  const at = normalizedText(a.title);
  const bt = normalizedText(b.title);
  const jaccard = titleJaccard(at, bt);
  return (
    0.55 * jaccard + 0.35 * jaroWinkler(at, bt) + 0.1 * (ay === by ? 1 : 0.5)
  );
}

export type DuplicateCandidate = {
  leftId: string;
  rightId: string;
  kind: 'hard' | 'soft';
  score: number;
  preferredId: string;
  differingFields: (keyof CiteWork)[];
};

/** Returns review candidates; it never deletes or merges library items. */
export function deduplicateLibrary(
  works: readonly CiteWork[]
): DuplicateCandidate[] {
  if (works.length > 1000)
    throw new RangeError('Compare at most 1000 citation items at a time');
  const priority = {
    verified_registry: 3,
    url_scraped: 2,
    manual: 1,
    ai_inferred: 0,
  };
  const candidates: DuplicateCandidate[] = [];
  const ambiguous = ambiguousCitationIdentityKeys(works);
  const prepared = works.map((work) => ({
    work,
    keys: new Set(hardMatchKeys(work)),
    title: normalizedText(work.title),
    author: firstAuthor(work),
    year: issuedYear(work),
  }));
  for (let i = 0; i < works.length; i += 1)
    for (let j = i + 1; j < works.length; j += 1) {
      const a = works[i];
      const b = works[j];
      if (!a || !b) continue;
      const left = prepared[i];
      const right = prepared[j];
      if (!left || !right) continue;
      if (haveConflictingCitationIdentifiers(a, b)) continue;
      const hard = [...right.keys].some(
        (key) => left.keys.has(key) && !ambiguous.has(key)
      );
      if (
        !hard &&
        (!left.author ||
          left.author !== right.author ||
          left.year === undefined ||
          right.year === undefined ||
          Math.abs(left.year - right.year) > 1)
      )
        continue;
      if (!hard && titleJaccard(left.title, right.title) * 0.55 + 0.45 < 0.88)
        continue;
      const score = hard ? 1 : citationSimilarity(a, b);
      if (score < 0.88) continue;
      if (candidates.length >= 1000)
        throw new RangeError(
          'Too many duplicate candidates; compare a smaller library selection'
        );
      const differingFields = CiteWorkSchema.keyof().options.filter(
        (key) =>
          key !== 'id' && JSON.stringify(a[key]) !== JSON.stringify(b[key])
      );
      candidates.push({
        leftId: a.id,
        rightId: b.id,
        kind: hard ? 'hard' : 'soft',
        score,
        preferredId:
          priority[a.provenance.verificationStatus] >=
          priority[b.provenance.verificationStatus]
            ? a.id
            : b.id,
        differingFields,
      });
    }
  return candidates;
}
