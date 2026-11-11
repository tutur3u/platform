import type { LegalDocument, LegalLocale, LegalSection } from '../types';
import { type HoldContext, releasedHoldSet } from './holds';
import { REVISION_DATE, revisionSource } from './source/index.generated';
import type { RevisionKind, RevisionPart } from './types';

export * from './holds';
export { FINAL_SOURCE_SHA256, REVISION_DATE } from './source/index.generated';
export type { RevisionKind } from './types';

export const REVISION_KINDS = [
  'privacy',
  'terms',
  'dpa',
  'subprocessors',
] as const satisfies readonly RevisionKind[];

type Style = Pick<LegalSection, 'icon' | 'tone'>;
const STYLES: Record<string, Style> = {
  'privacy-section-1': { icon: 'shield', tone: 'purple' },
  'privacy-organisations': { icon: 'users', tone: 'blue' },
  'privacy-children': { icon: 'users', tone: 'rose' },
  'privacy-section-2': { icon: 'file', tone: 'blue' },
  'privacy-billing': { icon: 'credit-card', tone: 'emerald' },
  'privacy-emails': { icon: 'bell', tone: 'orange' },
  'privacy-section-3': { icon: 'clock', tone: 'amber' },
  'privacy-conversations': { icon: 'users', tone: 'cyan' },
  'privacy-section-4': { icon: 'lock', tone: 'emerald' },
  'privacy-section-5': { icon: 'code', tone: 'cyan' },
  'privacy-meetings': { icon: 'users', tone: 'indigo' },
  'privacy-mobile': { icon: 'bell', tone: 'blue' },
  'privacy-rights': { icon: 'scale', tone: 'indigo' },
  'privacy-contact': { icon: 'globe', tone: 'purple' },
  'terms-section-1': { icon: 'users', tone: 'purple' },
  'terms-end-users': { icon: 'users', tone: 'blue' },
  'terms-section-2': { icon: 'lock', tone: 'blue' },
  'terms-messages': { icon: 'bell', tone: 'orange' },
  'terms-purchase': { icon: 'credit-card', tone: 'emerald' },
  'terms-seats': { icon: 'users', tone: 'emerald' },
  'terms-usage': { icon: 'database', tone: 'amber' },
  'terms-section-4': { icon: 'code', tone: 'cyan' },
  'terms-recording': { icon: 'users', tone: 'indigo' },
  'terms-section-5': { icon: 'database', tone: 'orange' },
  'terms-section-6': { icon: 'scale', tone: 'rose' },
  'terms-contract': { icon: 'file', tone: 'purple' },
  'terms-changes': { icon: 'clock', tone: 'amber' },
  'terms-law': { icon: 'scale', tone: 'indigo' },
  'dpa-section-1': { icon: 'file', tone: 'purple' },
  'dpa-processor': { icon: 'shield', tone: 'blue' },
  'dpa-section-2': { icon: 'lock', tone: 'emerald' },
  'dpa-section-3': { icon: 'globe', tone: 'blue' },
  'dpa-breach': { icon: 'bell', tone: 'orange' },
  'dpa-requests': { icon: 'users', tone: 'cyan' },
  'dpa-children': { icon: 'users', tone: 'rose' },
  'dpa-communications': { icon: 'bell', tone: 'amber' },
  'dpa-meetings': { icon: 'users', tone: 'indigo' },
  'dpa-vietnam': { icon: 'scale', tone: 'emerald' },
  'dpa-section-5': { icon: 'scale', tone: 'indigo' },
  'dpa-annex-1': { icon: 'file', tone: 'blue' },
  'dpa-annex-2': { icon: 'server', tone: 'cyan' },
  'dpa-annex-3': { icon: 'lock', tone: 'purple' },
  'subprocessors-section-1': { icon: 'server', tone: 'blue' },
  'subprocessors-section-2': { icon: 'shield', tone: 'emerald' },
  'subprocessors-roles': { icon: 'users', tone: 'cyan' },
  'subprocessors-registry': { icon: 'database', tone: 'purple' },
};

export interface RevisionRenderOptions extends HoldContext {
  /** Pinned mobile release date D (YYYY-MM-DD); fills `{D}` placeholders. */
  mobileDate?: string | null;
}

const isTableLine = (line: string) => line.startsWith('|');
const isSeparator = (line: string) => /^\|(\s*:?-+:?\s*\|)+$/u.test(line);
const cells = (line: string) =>
  line
    .split('|')
    .slice(1, -1)
    .map((cell) => cell.trim());

function formatDate(date: string, locale: LegalLocale) {
  const [year, month, day] = date.split('-').map(Number);
  if (locale === 'vi') return `${day} tháng ${month} năm ${year}`;
  const name = new Date(Date.UTC(year!, month! - 1, day!)).toLocaleString(
    'en-GB',
    { month: 'long', timeZone: 'UTC' }
  );
  return `${day} ${name} ${year}`;
}

/** Joins the visible parts of a body: held text out, fallbacks in. */
export function renderParts(
  parts: readonly RevisionPart[],
  released: ReadonlySet<string>
): string {
  const text = parts
    .filter((part) => (part.holds ?? []).every((id) => released.has(id)))
    .filter((part) => !(part.fallbackFor && released.has(part.fallbackFor)))
    .map((part) => part.text)
    .join('');
  const lines = text.split('\n').map((line) => line.trimEnd());
  // Structural clean-up only: a table left with a header and no body rows is
  // dropped, then blank-line runs collapse.
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (
      isTableLine(line) &&
      !isTableLine(out.at(-1) ?? '') &&
      isSeparator(lines[i + 1] ?? '') &&
      !isTableLine(lines[i + 2] ?? '')
    ) {
      i++;
      continue;
    }
    out.push(line);
  }
  return out
    .join('\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
}

function fillMobileDate(
  text: string,
  locale: LegalLocale,
  mobileDate?: string | null
) {
  if (!mobileDate) return text;
  return text
    .replaceAll('{D_ISO}', mobileDate)
    .replaceAll('{D}', formatDate(mobileDate, locale));
}

/** The legal markdown renderer lists `*` items; the FINAL writes `- `. */
const toLegalMarkdown = (text: string) => text.replace(/^- /gmu, '* ');

export interface RevisionDocumentReport {
  document: LegalDocument;
  /** Sections dropped because every line of their body is held. */
  removedSections: string[];
}

export function renderRevisionDocumentWithReport(
  kind: RevisionKind,
  locale: LegalLocale,
  options: RevisionRenderOptions = {}
): RevisionDocumentReport {
  const source = revisionSource.documents[kind][locale];
  const released = releasedHoldSet(options);
  // Released mobile text carries `{D}`; never render it without a real date.
  if (released.has('mobile') && !options.mobileDate)
    throw new Error('Releasing the mobile items requires the pinned date D');
  const removedSections: string[] = [];
  const sections: LegalSection[] = [];
  for (const section of source.sections) {
    const content = fillMobileDate(
      renderParts(section.parts, released),
      locale,
      options.mobileDate
    );
    if (!content) {
      removedSections.push(section.id);
      continue;
    }
    sections.push({
      id: section.id,
      title: section.title,
      content: toLegalMarkdown(content),
      ...(STYLES[section.id] ?? { icon: 'file', tone: 'blue' }),
    });
  }
  return {
    removedSections,
    document: {
      badge: source.badge,
      effectiveDate: REVISION_DATE,
      footer: source.footer,
      highlightedWord: source.highlightedWord,
      kind,
      locale,
      publishedDate: REVISION_DATE,
      reviewRequired: false,
      sections,
      summaryDescription: source.summaryDescription,
      summaryRows: source.summaryRows,
      summaryTitle: source.summaryTitle,
      title: source.title,
      version: REVISION_DATE,
    },
  };
}

export function renderRevisionDocument(
  kind: RevisionKind,
  locale: LegalLocale,
  options?: RevisionRenderOptions
): LegalDocument {
  return renderRevisionDocumentWithReport(kind, locale, options).document;
}

/** The change notice, with `{N}`, `{N30}` and `{ARCHIVE_LINKS}` kept. */
export function renderRevisionNotice(
  locale: LegalLocale,
  options: HoldContext = {}
) {
  const source = revisionSource.notice[locale];
  const table = renderParts(source.table, releasedHoldSet(options))
    .split('\n')
    .filter((line) => isTableLine(line) && !isSeparator(line));
  return {
    title: source.title,
    binding: source.binding,
    tableHead: source.tableHead,
    rows: table.slice(1).map(cells),
    nonbinding: source.nonbinding,
    summaryTitle: source.summaryTitle,
    links: source.links,
  };
}
export { structuralProblems } from './structure';
