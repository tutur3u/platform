import {
  AUGUST_LEGAL_VERSION,
  getLegalDocumentVersion,
  type LegalDocumentKind,
} from '@tuturuuu/legal';
import { toLegalPageConfig } from './canonical-legal-config';
import type { LegalPageConfig } from './legal-types';

export const ARCHIVE_VERSION = AUGUST_LEGAL_VERSION;
export const ARCHIVED_KINDS = [
  'terms',
  'privacy',
  'dpa',
  'sla',
  'subprocessors',
] as const satisfies readonly LegalDocumentKind[];
export type ArchivedKind = (typeof ARCHIVED_KINDS)[number];

export const isArchivedKind = (kind: string): kind is ArchivedKind =>
  (ARCHIVED_KINDS as readonly string[]).includes(kind);

export const archivePath = (locale: string, kind?: ArchivedKind) =>
  `${locale === 'vi' ? '/vi' : ''}/legal/archive/${ARCHIVE_VERSION}${kind ? `/${kind}` : ''}`;

/**
 * The 2026-08-15 document exactly as its canonical page served it, without the
 * "upcoming changes" line, which belongs to the live page only.
 */
export function getArchivedLegalPageConfig(
  kind: ArchivedKind,
  locale: string
): LegalPageConfig {
  const document = getLegalDocumentVersion(ARCHIVE_VERSION, kind, locale);
  if (!document) throw new Error(`No ${ARCHIVE_VERSION} ${kind} document`);
  return { ...toLegalPageConfig(document), upcomingChanges: undefined };
}
