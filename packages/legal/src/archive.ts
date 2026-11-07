import type { ArchivedLegalVersion } from './types';

const AUGUST_KINDS = [
  'privacy',
  'terms',
  'dpa',
  'sla',
  'subprocessors',
] as const;

export const ARCHIVED_LEGAL_VERSIONS: readonly ArchivedLegalVersion[] = [
  // Served at /legal/archive/2026-08-15 (EN and VI), unchanged.
  ...AUGUST_KINDS.flatMap((kind) =>
    (['en', 'vi'] as const).map((locale) => ({
      effectiveDate: '2026-08-15',
      kind,
      locale,
      version: '2026-08-15',
    }))
  ),
  {
    effectiveDate: '2026-02-06',
    kind: 'privacy',
    locale: 'en',
    version: '2026-02-06',
  },
  {
    effectiveDate: '2025-01-01',
    kind: 'terms',
    locale: 'en',
    version: '2025-01-01',
  },
] as const;
