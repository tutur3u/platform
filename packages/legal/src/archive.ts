import type { ArchivedLegalVersion } from './types';

export const ARCHIVED_LEGAL_VERSIONS: readonly ArchivedLegalVersion[] = [
  {
    effectiveDate: '2026-11-21',
    kind: 'privacy',
    locale: 'en',
    version: '2026-11-21',
  },
  {
    effectiveDate: '2026-11-21',
    kind: 'privacy',
    locale: 'vi',
    version: '2026-11-21',
  },
  {
    effectiveDate: '2026-11-12',
    kind: 'subprocessors',
    locale: 'en',
    version: '2026-11-12',
  },
  {
    effectiveDate: '2026-11-12',
    kind: 'subprocessors',
    locale: 'vi',
    version: '2026-11-12',
  },
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
