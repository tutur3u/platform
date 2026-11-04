import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  getLegalDocument,
  getLegalDocumentVersion,
  type LegalNoticeConfig,
} from '@tuturuuu/legal';
import { describe, expect, it } from 'vitest';
import { thirdPartyCategories as liveCategories } from '@/data/legal/third-party-providers';
import { thirdPartyCategories as frozenCategories } from '@/data/legal/third-party-providers.2026-08-15';
import {
  ARCHIVE_VERSION,
  ARCHIVED_KINDS,
  getArchivedLegalPageConfig,
} from './archive-legal-config';
import { toLegalPageConfig } from './canonical-legal-config';

const appRoot = process.cwd();
const sha256 = (text: string) =>
  createHash('sha256').update(text).digest('hex');
const read = (path: string) => readFileSync(join(appRoot, path), 'utf8');

const FROZEN_PROVIDERS = 'src/data/legal/third-party-providers.2026-08-15.ts';
/**
 * sha256 of the provider list as it was before 9af22dae (git blob
 * 93f5874f16d2f6c882be7d12823163325f3a152f). The frozen file must never
 * change: the 2026-08-15 archive is a record of what was in force.
 */
const FROZEN_PROVIDERS_SHA256 =
  '2fc4fa7667987987878718541c5a92ef0acb9843b507258c8bbd6bdebdff6243';
/** The retired apps/tanstack-web copy (git blob 62e61f26), pinned here. */
const TANSTACK_FROZEN_PROVIDERS = `../tanstack-web/${FROZEN_PROVIDERS}`;
const TANSTACK_FROZEN_PROVIDERS_SHA256 =
  '6e1944254ef68fadcf91f664777e770b4f74a23495c96ba245d6b3e342021636';
/** sha256 of every archived 2026-08-15 document (EN and VI) as served. */
const ARCHIVE_SHA256 =
  'e7fab31a5d25710179871b04e9826833b46c287f554718c8936242adcfa2c30d';

const published = {
  published: true,
  noticeDate: '2026-11-11',
  laterDate: '2026-12-11',
  mobilePrivacyEffectiveDate: '2026-11-11',
  archiveLinks: { en: 'x', vi: 'x' },
} satisfies LegalNoticeConfig;

const LIVE_KINDS = [
  'privacy',
  'terms',
  'dpa',
  'sla',
  'subprocessors',
  'acceptable-use',
  'community-guidelines',
] as const;

/** The 2026-08-15 privacy prose that names Vercel Analytics. */
const OLD_VERCEL_PROSE = [
  'Analytics via **Vercel Analytics** (privacy-friendly, no personal data tracking)',
  '**Vercel Analytics** — privacy-friendly usage analytics',
];

function sourceFiles(dir: string): string[] {
  return readdirSync(join(appRoot, dir), { withFileTypes: true }).flatMap(
    (entry) => {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) return sourceFiles(path);
      return /\.(ts|tsx)$/u.test(entry.name) ? [path] : [];
    }
  );
}

function archiveSnapshot() {
  return ARCHIVED_KINDS.flatMap((kind) =>
    (['en', 'vi'] as const).map((locale) => {
      const config = getArchivedLegalPageConfig(kind, locale);
      return {
        kind,
        locale,
        document: getLegalDocumentVersion(ARCHIVE_VERSION, kind, locale),
        sections: config.sections.map(({ title, content }) => ({
          title,
          content,
        })),
        upcomingChanges: config.upcomingChanges ?? null,
      };
    })
  );
}

describe('frozen 2026-08-15 provider list', () => {
  it('is byte-identical to the list in force on 2026-08-15', () => {
    expect(sha256(read(FROZEN_PROVIDERS))).toBe(FROZEN_PROVIDERS_SHA256);
    expect(sha256(read(TANSTACK_FROZEN_PROVIDERS))).toBe(
      TANSTACK_FROZEN_PROVIDERS_SHA256
    );
  });

  it('keeps the Analytics category and both Vercel entries', () => {
    const analytics = frozenCategories.find((c) => c.name === 'Analytics');
    expect(analytics?.providers.map((p) => p.name)).toEqual([
      'Vercel Analytics',
      'Vercel Speed Insights',
    ]);
  });

  it('is unaffected by edits to the live list', () => {
    expect(liveCategories.some((c) => c.name === 'Analytics')).toBe(false);
    expect(frozenCategories.slice(0, -1)).toEqual(liveCategories);
  });

  it('is the only provider list the archive may use', () => {
    const archiveSources = [
      'src/components/legal/archive-legal-config.ts',
      ...sourceFiles('src/app/[locale]/(marketing)/legal/archive'),
    ];
    for (const path of archiveSources)
      expect(read(path)).not.toMatch(/third-party-providers['"]/u);
  });
});

describe('legal archive 2026-08-15 byte identity', () => {
  it('serves exactly the pinned 2026-08-15 text, before and after the flip', () => {
    expect(sha256(JSON.stringify(archiveSnapshot()))).toBe(ARCHIVE_SHA256);
  });
});

describe('after the 2026-11-11 flip', () => {
  it('no live page renders the old Vercel Analytics prose', () => {
    for (const locale of ['en', 'vi'] as const)
      for (const kind of LIVE_KINDS) {
        const config = toLegalPageConfig(
          getLegalDocument(kind, locale, published)
        );
        const text = JSON.stringify(
          config.sections.map(({ title, content }) => ({ title, content }))
        );
        expect(text, `${locale} ${kind}`).not.toContain('Vercel Analytics');
      }
  });

  it('keeps the old prose only in files no page imports', () => {
    const files = sourceFiles('src').filter(
      (path) => !path.endsWith('.test.ts') && !path.endsWith('.test.tsx')
    );
    const withOldProse = files.filter((path) =>
      OLD_VERCEL_PROSE.some((prose) => read(path).includes(prose))
    );
    expect(withOldProse).toEqual(['src/data/legal/privacy-sections.tsx']);
    const orphans = /\/(privacy-sections|terms-sections)['"]/u;
    for (const path of files)
      expect(read(path), relative('src', path)).not.toMatch(orphans);
  });
});
