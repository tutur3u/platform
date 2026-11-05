// Extracts the frozen FINAL legal text into
// `src/revision-2026-11-11/source/*.generated.ts`.
//
// Usage: bun packages/legal/scripts/extract-final-revision.ts <FINAL.md>
//        bunx biome format --write packages/legal/src/revision-2026-11-11
//
// The script never edits wording. It:
// - checks the FINAL file's SHA-256 against the frozen hash;
// - drops reviewer annotations that are never published (`id:` lines,
//   `[INTERNAL …]` notes, `[STAGE 2 — DO NOT PUBLISH YET]` blocks, the
//   header and separator rows of held mini-tables);
// - turns every `[HOLD …]` block, `[GATE …]`, `[verify …]` and `[PENDING …]`
//   marker into a hold unit, so held text stays out of the rendered output
//   until its id is released in `holds.ts`;
// - strips `[OWNER …]` markers, whose tag says the sentence is kept;
// - verifies that the extracted lines, with every tag removed, are exactly the
//   FINAL's lines with the same tags removed.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const FINAL_SHA256 =
  '1234b293dfb5b83c4cc94ff6716a3a10df6bcd284263e394241ef38e8838a8f6';
const REVISION_DATE = '2026-11-11';
const EFFECTIVE_DATE_TEXT = {
  en: '11 November 2026',
  vi: 'ngày 11 tháng 11 năm 2026',
};

type Locale = 'en' | 'vi';
type Kind = 'privacy' | 'terms' | 'dpa' | 'subprocessors';
interface Part {
  fallbackFor?: string;
  holds?: string[];
  text: string;
}

const sourcePath = process.argv[2];
if (!sourcePath) throw new Error('Pass the FINAL markdown path');
const raw = readFileSync(sourcePath);
const sha = createHash('sha256').update(raw).digest('hex');
if (sha !== FINAL_SHA256)
  throw new Error(`FINAL sha256 mismatch: ${sha} !== ${FINAL_SHA256}`);
const lines = raw.toString('utf8').split('\n');

const DOCS: Record<string, [Kind, Locale]> = {
  '1.1': ['privacy', 'en'],
  '1.2': ['privacy', 'vi'],
  '1.3': ['terms', 'en'],
  '1.4': ['terms', 'vi'],
  '1.5': ['dpa', 'en'],
  '1.6': ['dpa', 'vi'],
  '1.7': ['subprocessors', 'en'],
  '1.8': ['subprocessors', 'vi'],
};

// Rows of held mini-tables that are not paired with a fallback row go back
// into the main table after this row when released (from each block's
// `[INTERNAL …]` note).
const INSERT_AFTER_ROW: Record<string, string[]> = {
  ks: [
    'Google Cloud',
    'Privacy: AI providers and security',
    'Quyền riêng tư: nhà cung cấp AI và bảo mật',
  ],
};

const isTableRow = (line: string) => line.trimStart().startsWith('|');
const isSeparator = (line: string) => /^\|(\s*:?-+:?\s*\|)+\s*$/u.test(line);
const firstCell = (line: string) => line.split('|')[1]?.trim() ?? '';
const blockHoldId = (label: string) =>
  label.trim().toLowerCase().replaceAll('/', '-');

/** Finds bracket tags (with nested brackets), skipping markdown links. */
function findTags(text: string) {
  const tags: { end: number; start: number; tag: string }[] = [];
  let index = 0;
  while (true) {
    const start = text.indexOf('[', index);
    if (start < 0) break;
    let depth = 0;
    let end = start;
    for (; end < text.length; end++) {
      if (text[end] === '[') depth++;
      else if (text[end] === ']' && --depth === 0) break;
    }
    const tag = text.slice(start, end + 1);
    index = end + 1;
    if (text[end + 1] === '(') continue;
    if (/^\[(GATE|verify|PENDING|OWNER|INTERNAL)\b/u.test(tag))
      tags.push({ start, end: end + 1, tag });
  }
  return tags;
}

const stripTag = (text: string, tag: { end: number; start: number }) => {
  const before = text.slice(0, tag.start).replace(/ $/u, '');
  const after = text.slice(tag.end);
  return (
    before +
    (before && after && !/^[\s.,;)]/u.test(after) ? ' ' : '') +
    after.replace(/^ (?=[.,;)])/u, '')
  );
};

/** Removes every tag (for the verbatim check and for released text). */
function stripAllTags(text: string): string {
  let out = text;
  for (const tag of findTags(out).reverse()) out = stripTag(out, tag);
  return out.replaceAll('[EFFECTIVE DATE]', '{EFFECTIVE DATE}');
}

let gateCounter = new Map<string, number>();
function nextGateId(scope: string) {
  const n = (gateCounter.get(scope) ?? 0) + 1;
  gateCounter.set(scope, n);
  return `${scope}#${n}`;
}

/**
 * Splits one line into parts. `scope` names the section, so the n-th sentence
 * gate gets the same id in EN and VI.
 */
function splitLine(line: string, scope: string, outer: string[]): Part[] {
  const tags = findTags(line).filter((t) => !t.tag.startsWith('[INTERNAL'));
  // Inline [INTERNAL …] notes are never published; drop them first.
  let text = line;
  for (const t of findTags(text)
    .filter((t) => t.tag.startsWith('[INTERNAL'))
    .reverse())
    text = text.slice(0, t.start).replace(/ $/u, '') + text.slice(t.end);
  if (tags.length === 0) return [{ text, holds: outer }];

  const holdTags = findTags(text).filter(
    (t) =>
      !t.tag.startsWith('[OWNER') && !t.tag.startsWith('[GATE SR-923 logging')
  );
  const plain = stripAllTagsKeepPositions(text);

  if (isTableRow(text)) {
    // A table row with an open marker is held as a whole: no partial cells.
    const holds = [...outer];
    if (holdTags.some((t) => t.tag.startsWith('[GATE KS'))) holds.push('ks');
    if (holdTags.some((t) => !t.tag.startsWith('[GATE KS')))
      holds.push(nextGateId(scope));
    return [{ text: plain, holds: [...new Set(holds)] }];
  }
  if (holdTags.length === 0) return [{ text: plain, holds: outer }];

  // One open marker per prose line in this FINAL; enforce it.
  const ksTags = holdTags.filter((t) => t.tag.startsWith('[GATE KS'));
  const otherTags = holdTags.filter((t) => !t.tag.startsWith('[GATE KS'));
  if (otherTags.length > 1 || (otherTags.length && ksTags.length))
    throw new Error(`Unexpected marker mix in: ${line}`);
  const first = (ksTags[0] ?? otherTags[0])!;
  const id = ksTags.length
    ? 'ks'
    : first.tag.startsWith('[GATE SR-923')
      ? 'gemini-request-logging'
      : nextGateId(scope);
  const lead = text.slice(0, first.start);
  const holds = [...outer, id];

  // Whole line: the tag starts the line, or follows only a list marker and an
  // optional bold lead-in (which would be orphaned otherwise).
  if (/^(\s*(- |\d+\. ))?(\*\*[^*]+\*\*\s*)?$/u.test(lead))
    return [{ text: plain, holds }];

  const plainLead = stripAllTagsKeepPositions(lead).replace(/ $/u, '');
  const rest = text.slice(first.end);
  // Inside parentheses: hold the parenthetical, from its "(" to its ")".
  const open = lead.lastIndexOf('(');
  if (open > lead.lastIndexOf(')') && rest.startsWith(')')) {
    const start = plainLead.lastIndexOf(' (');
    return [
      { text: plainLead.slice(0, start), holds: outer },
      { text: `${plainLead.slice(start)})`, holds },
      { text: stripAllTagsKeepPositions(rest.slice(1)), holds: outer },
    ];
  }
  // Tag after a sentence: hold that sentence (verify / PENDING / GATE rule).
  if (/^\s*[.]/u.test(rest) || rest.trim() === '') {
    const sentenceStart = Math.max(plainLead.lastIndexOf('. ') + 1, 0);
    const restAfter = rest.replace(/^\s*\./u, '');
    const dot = /^\s*\./u.test(rest) ? '.' : '';
    return [
      { text: plainLead.slice(0, sentenceStart), holds: outer },
      { text: plainLead.slice(sentenceStart) + dot, holds },
      { text: stripAllTagsKeepPositions(restAfter), holds: outer },
    ];
  }
  // Tag before a sentence (mid-line): hold from the tag to the end of line.
  return [
    { text: plainLead, holds: outer },
    { text: ` ${stripAllTagsKeepPositions(rest).trimStart()}`, holds },
  ];
}

function stripAllTagsKeepPositions(text: string) {
  return stripAllTags(text);
}

interface Section {
  id: string;
  parts: Part[];
  title: string;
}

/** Parses a body (section or notice) into parts. */
function parseBody(body: string[], scope: string, locale: Locale): Part[] {
  const parts: Part[] = [];
  const rowParts = new Map<string, Part>();
  let i = 0;
  while (i < body.length) {
    const line = body[i]!;
    const trimmed = line.trim();
    if (trimmed.startsWith('[INTERNAL')) {
      i++;
      continue;
    }
    if (trimmed.startsWith('[STAGE 2')) {
      i++;
      while (i < body.length && (!body[i]!.trim() || body[i]!.startsWith('>')))
        i++;
      continue;
    }
    const hold = trimmed.match(/^\[HOLD ([^:\]]+)[:\]]/u);
    if (hold) {
      const id = blockHoldId(hold[1]!);
      const inner: string[] = [];
      i++;
      while (!body[i]!.trim().startsWith(`[/HOLD ${hold[1]}]`))
        inner.push(body[i++]!);
      i++;
      const note = inner.find((l) => l.trim().startsWith('[INTERNAL')) ?? '';
      const fallbackSentence = note.match(/fallback sentence "([^"]+)"/u)?.[1];
      const content = inner.filter((l) => !l.trim().startsWith('[INTERNAL'));
      const sep = content.findIndex(isSeparator);
      if (sep > 0) {
        // Held mini-table: drop its header; place rows by the main table.
        const rows = content.filter((l, n) => isTableRow(l) && n > sep);
        const fallbacks = rows
          .map((row) => rowParts.get(firstCell(row)))
          .filter((p): p is Part => Boolean(p));
        let anchor: Part | undefined;
        if (fallbacks.length === rows.length) {
          for (const f of fallbacks) f.fallbackFor = id;
          anchor = fallbacks.at(-1);
        } else {
          anchor = INSERT_AFTER_ROW[id]
            ?.map((cell) => rowParts.get(cell))
            .find(Boolean);
        }
        if (!anchor) throw new Error(`No placement for held rows in ${scope}`);
        const at = parts.indexOf(anchor) + 1;
        parts.splice(
          at,
          0,
          ...rows.flatMap((row) => splitLine(`${row}\n`, scope, [id]))
        );
      } else {
        if (fallbackSentence) {
          const owner = parts.find((p) => p.text.includes(fallbackSentence));
          if (!owner)
            throw new Error(`Fallback not found: ${fallbackSentence}`);
          const [before, after] = owner.text.split(fallbackSentence);
          const at = parts.indexOf(owner);
          parts.splice(
            at,
            1,
            { text: before!.replace(/ $/u, ''), holds: owner.holds },
            {
              text: `${before!.endsWith(' ') ? ' ' : ''}${fallbackSentence}`,
              holds: owner.holds,
              fallbackFor: id,
            },
            { text: after!, holds: owner.holds }
          );
        }
        for (const l of content)
          parts.push(
            ...splitLine(
              `${l.replaceAll('[EFFECTIVE DATE]', EFFECTIVE_DATE_TEXT[locale])}\n`,
              scope,
              [id]
            )
          );
      }
      continue;
    }
    const lineParts = splitLine(`${line}\n`, scope, []);
    if (isTableRow(line) && !isSeparator(line))
      rowParts.set(firstCell(line), lineParts[0]!);
    parts.push(...lineParts);
    i++;
  }
  return mergeParts(parts);
}

function mergeParts(parts: Part[]): Part[] {
  const out: Part[] = [];
  for (const part of parts) {
    if (!part.text) continue;
    const holds = part.holds?.length ? [...new Set(part.holds)] : undefined;
    const prev = out.at(-1);
    if (
      prev &&
      !prev.fallbackFor &&
      !part.fallbackFor &&
      JSON.stringify(prev.holds) === JSON.stringify(holds)
    )
      prev.text += part.text;
    else
      out.push({
        text: part.text,
        ...(holds ? { holds } : {}),
        ...(part.fallbackFor ? { fallbackFor: part.fallbackFor } : {}),
      });
  }
  for (const part of out) {
    if (part.holds === undefined) delete part.holds;
  }
  return out;
}

const field = (block: string[], name: string) => {
  const line = block.find((l) => l.startsWith(`**${name}:**`));
  if (!line) throw new Error(`Missing ${name}`);
  return line.slice(`**${name}:**`.length).trim();
};

function parseDocument(block: string[], kind: Kind, locale: Locale) {
  const firstSection = block.findIndex((l) => l.startsWith('#### '));
  const header = block.slice(0, firstSection);
  const fields = header.find((l) => l.startsWith('**Document fields'))!;
  const tick = (name: string) =>
    fields.match(new RegExp(`${name} \`([^\`]+)\``, 'u'))?.[1];
  const summaryRows = header
    .filter((l) => isTableRow(l) && !isSeparator(l))
    .slice(1)
    .map((row) => {
      const [, topic, summary] = row.split('|').map((c) => c.trim());
      return { topic: topic!, summary: summary! };
    });
  const sections: Section[] = [];
  let index = firstSection;
  gateCounter = new Map();
  while (index < block.length) {
    const heading = block[index]!;
    const title = heading.replace(/^#### [A-Z]\d+\. /u, '');
    const idLine = block[index + 1]!;
    const id = idLine.match(/^`id: ([a-z0-9-]+)`/u)?.[1];
    if (!id) throw new Error(`Missing id after ${heading}`);
    let end = index + 2;
    while (end < block.length && !block[end]!.startsWith('#### ')) end++;
    const body = block.slice(index + 2, end).filter((l) => l.trim() !== '---');
    let parts = parseBody(body, `${kind}/${id}`, locale);
    // P12 holds until the mobile release date D (its `[EFFECTIVE: D]` tag:
    // "If the fixed mobile build is not live on N, hold this section").
    if (id === 'privacy-mobile')
      parts = parts.map((p) => ({
        ...p,
        holds: [...(p.holds ?? []), 'mobile'],
      }));
    // The two Firebase registry rows are also `[EFFECTIVE: D]`.
    if (id === 'subprocessors-registry')
      parts = mergeParts(
        parts.flatMap((p) =>
          p.text.split(/(?<=\n)/u).map((text) => ({
            ...p,
            holds: text.startsWith('| Firebase ')
              ? [...(p.holds ?? []), 'mobile']
              : p.holds,
            text,
          }))
        )
      );
    sections.push({ id, title, parts });
    index = end;
  }
  return {
    badge: tick('badge')!,
    title: tick('title')!,
    highlightedWord: tick('highlightedWord')!,
    footer: field(header, 'footer'),
    summaryDescription: field(header, 'summaryDescription'),
    summaryTitle: field(header, 'summaryTitle'),
    summaryRows,
    sections,
  };
}

const documents: Record<string, Record<string, unknown>> = {};
const noticeStart = lines.findIndex((l) => l.startsWith('## 2. '));
const fileMapStart = lines.findIndex((l) => l.startsWith('## 3. '));
for (const [number, [kind, locale]] of Object.entries(DOCS)) {
  const start = lines.findIndex((l) => l.startsWith(`### ${number} `));
  let end = start + 1;
  while (
    end < noticeStart &&
    !lines[end]!.startsWith('### ') &&
    !lines[end]!.startsWith('## ')
  )
    end++;
  documents[kind] ??= {};
  documents[kind][locale] = parseDocument(
    lines.slice(start + 1, end),
    kind,
    locale
  );
}

function parseNotice(block: string[], locale: Locale) {
  const after = (name: string) => {
    const at = block.findIndex((l) => l.startsWith(`**${name}:**`));
    let end = at + 1;
    while (end < block.length && !/^\*\*[A-Za-z.]+:\*\*/u.test(block[end]!))
      end++;
    return block.slice(at + 1, end);
  };
  const trimBlank = (b: string[]) => b.join('\n').trim().split('\n');
  const binding = trimBlank(after('binding'));
  gateCounter = new Map();
  const tableParts = parseBody(trimBlank(after('tableHead')), 'notice', locale);
  const linksBlock = trimBlank(after('links'));
  const tableHeadLine = block.find((l) => l.startsWith('**tableHead:**'))!;
  return {
    title: field(block, 'title'),
    binding: binding.join('\n'),
    tableHead: tableHeadLine
      .slice('**tableHead:**'.length)
      .split(' · ')
      .map((c) => c.trim()),
    table: tableParts,
    nonbinding: field(block, 'nonbinding'),
    summaryTitle: field(block, 'summaryTitle'),
    links: linksBlock.filter((l) => l.startsWith('- ')).join('\n'),
  };
}

const noticeLines = lines.slice(noticeStart, fileMapStart);
const viAt = noticeLines.findIndex((l) => l.startsWith('### 2.2 '));
const enAt = noticeLines.findIndex((l) => l.startsWith('### 2.1 '));
const notice = {
  en: parseNotice(noticeLines.slice(enAt + 1, viAt), 'en'),
  vi: parseNotice(noticeLines.slice(viAt + 1), 'vi'),
};

// --- Verbatim check -------------------------------------------------------
// Every extracted line, with tags removed, must be a FINAL line with the same
// tags removed (and nothing published may come from outside the FINAL).
const finalLines = new Set(
  lines.flatMap((l) => {
    const stripped = stripAllTags(l);
    return [EFFECTIVE_DATE_TEXT.en, EFFECTIVE_DATE_TEXT.vi].map((date) =>
      normalise(stripped.replaceAll('{EFFECTIVE DATE}', date))
    );
  })
);
function normalise(text: string) {
  return text.replace(/\s+/gu, ' ').trim();
}
function checkVerbatim(parts: Part[], where: string) {
  const joined = parts.map((p) => p.text).join('');
  for (const line of joined.split('\n')) {
    const n = normalise(line);
    if (n && !finalLines.has(n))
      throw new Error(`Not verbatim in ${where}: ${line}`);
  }
}
for (const [kind, byLocale] of Object.entries(documents))
  for (const [locale, doc] of Object.entries(byLocale))
    for (const section of (doc as { sections: Section[] }).sections)
      checkVerbatim(section.parts, `${kind}/${locale}/${section.id}`);
for (const locale of ['en', 'vi'] as const)
  checkVerbatim(notice[locale].table, `notice/${locale}`);

// D is the pinned mobile release date (`mobilePrivacyEffectiveDate`), filled
// at render time: `{D}` in prose, `{D_ISO}` in the registry date column.
const fillD = (text: string) =>
  text
    .replaceAll('(mobile; from D)', '(mobile; from {D})')
    .replaceAll(
      '(ứng dụng di động; từ ngày D)',
      '(ứng dụng di động; từ ngày {D})'
    )
    .replaceAll('| On request | D |', '| On request | {D_ISO} |');
for (const byLocale of Object.values(documents))
  for (const doc of Object.values(byLocale))
    for (const section of (doc as { sections: Section[] }).sections)
      for (const part of section.parts) part.text = fillD(part.text);

// One module per document (and the notice) keeps each generated file small.
const HEADER = `// GENERATED by packages/legal/scripts/extract-final-revision.ts. Do not edit.
// Source: tuturuuu-policy-b2b2c-FINAL-20261103.md (legal; frozen).
// Wording changes need legal and security re-check, then re-extraction.
`;
const dir = new URL('../src/revision-2026-11-11/source/', import.meta.url);
mkdirSync(dir, { recursive: true });
const write = (name: string, body: string) =>
  writeFileSync(new URL(`${name}.generated.ts`, dir), HEADER + body);
for (const [kind, byLocale] of Object.entries(documents))
  write(
    kind,
    `import type { RevisionDocumentSource } from '../types';

export const ${kind}Source: Record<'en' | 'vi', RevisionDocumentSource> = ${JSON.stringify(byLocale, null, 2)};
`
  );
write(
  'notice',
  `import type { RevisionNoticeSource } from '../types';

export const noticeSource: Record<'en' | 'vi', RevisionNoticeSource> = ${JSON.stringify(notice, null, 2)};
`
);
write(
  'index',
  `import type { RevisionSource } from '../types';
${Object.keys(documents)
  .map((kind) => `import { ${kind}Source } from './${kind}.generated';`)
  .join('\n')}
import { noticeSource } from './notice.generated';

export const FINAL_SOURCE_SHA256 =
  '${FINAL_SHA256}';
export const REVISION_DATE = '${REVISION_DATE}';

export const revisionSource: RevisionSource = {
  documents: { ${Object.keys(documents)
    .map((kind) => `${kind}: ${kind}Source`)
    .join(', ')} },
  notice: noticeSource,
};
`
);
console.log(`wrote ${dir.pathname} from ${sha}`);
