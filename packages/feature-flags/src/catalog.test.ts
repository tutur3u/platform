import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import sourceRegistry from '../../../config/feature-flags.json';
import { featureFlagCatalog, validateCatalog } from './catalog';

const repoFile = (path: string) =>
  readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');
const repoFileExists = (path: string) =>
  existsSync(new URL(`../../../${path}`, import.meta.url));

const INFRA_SECRETS =
  'apps/infrastructure/src/app/[locale]/(dashboard)/[wsId]/secrets/constants.ts';
const SECRET_ALIASES: Record<string, string> = {
  ENABLE_TOPIC_ANNOUNCEMENTS: 'TOPIC_ANNOUNCEMENTS_SECRET',
};
const ENTRY_FIELDS = new Set([
  'key',
  'family',
  'kind',
  'scope',
  'description',
  'owner',
  'createdAt',
  'apps',
  'appsComplete',
  'sources',
  'defaults',
  'verifiedOnProdAt',
  'legacy',
  'legacyRemoveBy',
]);

const CREDENTIAL_FRAGMENTS = ['PASSWORD', 'PRIVATE', 'TOKEN', 'CERTIFICATE'];

const flagsIn = (family: string) =>
  featureFlagCatalog.flags.filter((flag) => flag.family === family);

function workspaceUtilsFlags() {
  const data = repoFile('packages/utils/src/feature-flags/data.ts');
  return [...data.matchAll(/^\s+([A-Z_]+): '\1',$/gm)].map((m) => m[1]);
}

function infraFeatureBooleans() {
  const source = repoFile(INFRA_SECRETS);
  const section = source.slice(
    source.indexOf('// Feature Flags'),
    source.indexOf('];', source.indexOf('// Feature Flags'))
  );
  const topicSecret = /TOPIC_ANNOUNCEMENTS_SECRET = '([A-Z_]+)'/.exec(
    repoFile('apps/infrastructure/src/lib/topic-announcements.ts')
  )?.[1];
  return [
    ...section.matchAll(
      /\{\s*name: (?:'([A-Z_]+)'|([A-Z_]+)),[^}]*?type: '(\w+)'/g
    ),
  ]
    .filter((m) => m[3] === 'boolean')
    .map(
      (m) =>
        m[1] ?? (m[2] === 'TOPIC_ANNOUNCEMENTS_SECRET' ? topicSecret : m[2])
    );
}

describe('feature flag catalog', () => {
  it('passes lifecycle metadata validation with only known fields', () => {
    expect(validateCatalog(featureFlagCatalog)).toEqual([]);
    for (const flag of featureFlagCatalog.flags) {
      expect(
        Object.keys(flag).filter((field) => !ENTRY_FIELDS.has(field)),
        flag.key
      ).toEqual([]);
    }
  });

  it('mirrors the mobile registry without changing its contract', () => {
    expect(
      flagsIn('mobile-runtime').map((flag) => ({
        key: flag.key,
        description: flag.description,
        owner: flag.owner,
        class: flag.kind === 'kill-switch' ? 'kill' : 'release',
        default: flag.defaults.production,
        removeBy: flag.legacyRemoveBy,
      }))
    ).toEqual(
      sourceRegistry.map((flag) => ({
        key: flag.key,
        description: flag.description,
        owner: flag.owner,
        class: flag.class === 'kill' ? 'kill' : 'release',
        default: flag.default,
        removeBy: flag.removeBy,
      }))
    );
    for (const flag of flagsIn('mobile-runtime')) {
      expect(new Set(Object.values(flag.defaults)).size).toBe(1);
    }
  });

  it('covers every workspace-secret feature boolean exactly once', () => {
    const inventory = new Set([
      ...workspaceUtilsFlags(),
      ...infraFeatureBooleans(),
    ]);
    expect(inventory.size).toBeGreaterThan(20);
    expect(
      flagsIn('workspace-secret')
        .map((flag) => flag.key)
        .sort()
    ).toEqual([...inventory].sort());
  });

  it('keeps workspace defaults equal to the shared runtime defaults', () => {
    const defaults = repoFile('packages/utils/src/feature-flags/default.ts');
    for (const flag of flagsIn('workspace-secret')) {
      const declared = new RegExp(`\\b${flag.key}: (true|false),`).exec(
        defaults
      )?.[1];
      if (declared !== undefined) {
        expect(flag.defaults.production, flag.key).toBe(declared === 'true');
      }
      expect(flag.scope).toBe('workspace');
    }
  });

  it('covers every non-secret mobile build feature setting', () => {
    const constants = repoFile(
      'apps/infrastructure/src/lib/mobile-deployment/constants.ts'
    );
    const nonSecret = constants.slice(
      constants.indexOf('MOBILE_DEPLOYMENT_NON_SECRET_NAMES'),
      constants.indexOf(
        ']);',
        constants.indexOf('MOBILE_DEPLOYMENT_NON_SECRET_NAMES')
      )
    );
    const env = repoFile('apps/mobile/lib/core/config/env.dart');
    const buildKeys = [
      ...nonSecret.matchAll(/'(MOBILE_[A-Z_]+_ENABLED)'/g),
    ].map((m) => m[1]);
    expect(flagsIn('mobile-build').map((flag) => flag.key)).toEqual(buildKeys);
    for (const key of buildKeys) {
      expect(env).toMatch(
        new RegExp(`bool\\.fromEnvironment\\(\\s*'${key}',\\s*\\)`)
      );
    }
    for (const flag of flagsIn('mobile-build')) {
      expect(flag.scope).toBe('build');
      expect(Object.values(flag.defaults)).toEqual([false, false, false]);
    }
  });

  it('traces every entry to sources that still name the flag', () => {
    for (const flag of featureFlagCatalog.flags) {
      for (const source of flag.sources) {
        expect(repoFileExists(source), `${flag.key}: ${source}`).toBe(true);
        const content = repoFile(source);
        const alias = SECRET_ALIASES[flag.key];
        expect(
          content.includes(flag.key) ||
            (alias !== undefined && content.includes(alias)),
          `${flag.key} is not named in ${source}`
        ).toBe(true);
      }
    }
  });

  it('records no production verification or credential-shaped entries', () => {
    for (const flag of featureFlagCatalog.flags) {
      expect(flag.verifiedOnProdAt, flag.key).toBeNull();
      for (const fragment of CREDENTIAL_FRAGMENTS) {
        expect(
          flag.key.includes(fragment),
          `${flag.key} contains ${fragment}`
        ).toBe(false);
      }
      expect(flag.key.endsWith('_KEY'), `${flag.key} ends with _KEY`).toBe(
        false
      );
    }
  });

  it('limits legacy unknowns to the inventory adopted with the catalog', () => {
    const adopted = new Set([
      ...sourceRegistry.map((flag) => flag.key),
      ...workspaceUtilsFlags(),
      ...infraFeatureBooleans(),
      'MOBILE_TASK_DESCRIPTION_EDITING_ENABLED',
      'MOBILE_CALENDAR_INTEGRATIONS_ENABLED',
    ]);
    const legacy = featureFlagCatalog.flags.filter((flag) => flag.legacy);
    expect(legacy.length).toBe(50);
    for (const flag of legacy)
      expect(adopted.has(flag.key), flag.key).toBe(true);
  });
});
