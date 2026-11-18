import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { openNextFamilyNextConfig } from './next-family-config';
import {
  appRouteEntries,
  applyPrune,
  DEFAULT_APP_DIR,
  DISPOSABLE_MARKER,
  DISPOSABLE_MARKER_CONTENT,
  enabledFamilies,
  familyOwns,
  isRouteEntry,
  loadFamilies,
  planPrune,
  PROBE_ENTRIES,
  routePathFor,
} from './prune';

const { config } = loadFamilies();
const gateway = JSON.parse(
  readFileSync(
    new URL('../../../gateway/src/manifest.json', import.meta.url),
    'utf8'
  )
) as {
  webFamilies: {
    deny: string[];
    families: Array<{
      id: string;
      exact: string[];
      prefix: string[];
      exclude: string[];
    }>;
  };
};

const API_IDENTITY_ROUTES = [
  'api/auth/me/route.ts',
  'api/build-info/route.ts',
  'api/health/route.ts',
  'api/v1/notifications/[id]/metadata/route.ts',
  'api/v1/notifications/[id]/route.ts',
  'api/v1/notifications/account-preferences/route.ts',
  'api/v1/notifications/mail-thread/route.ts',
  'api/v1/notifications/preferences/route.ts',
  'api/v1/notifications/push-devices/route.ts',
  'api/v1/notifications/route.ts',
  'api/v1/notifications/unread-count/route.ts',
  'api/v1/user/onboarding-progress/route.ts',
  'api/v1/user/profile/route.ts',
  'api/v1/users/calendar-settings/route.ts',
  'api/v1/users/me/avatar/route.ts',
  'api/v1/users/me/avatar/upload-url/route.ts',
  'api/v1/users/me/banner/route.ts',
  'api/v1/users/me/banner/upload-url/route.ts',
  'api/v1/users/me/board-list-overrides/route.ts',
  'api/v1/users/me/bootstrap/route.ts',
  'api/v1/users/me/configs/[configId]/route.ts',
  'api/v1/users/me/default-workspace/route.ts',
  'api/v1/users/me/full-name/route.ts',
  'api/v1/users/me/hidden-workspaces/route.ts',
  'api/v1/users/me/hive-access/route.ts',
  'api/v1/users/me/profile/route.ts',
  'api/v1/users/me/workspaces/[wsId]/configs/[configId]/route.ts',
  'api/v1/users/sessions/[sessionId]/route.ts',
  'api/v1/users/sessions/route.ts',
  'api/v1/workspaces/limits/route.ts',
  'api/v1/workspaces/personal/route.ts',
  'api/v1/workspaces/route.ts',
  'api/workspaces/invitations/route.ts',
];

// Test-local copy of the family table with api-identity enabled, so its exact
// route set stays covered while the committed table holds it back.
const API_IDENTITY_ENABLED = {
  ...config,
  families: config.families.map((family) =>
    family.id === 'api-identity'
      ? {
          ...family,
          enabled: true,
          held: null,
        }
      : family
  ),
};

function fixtureAppDir(srcDir?: string) {
  const appDir = mkdtempSync(path.join(tmpdir(), 'opennext-family-'));
  mkdirSync(path.join(appDir, 'cloudflare/opennext'), { recursive: true });
  writeFileSync(
    path.join(appDir, 'cloudflare/opennext/families.json'),
    JSON.stringify(API_IDENTITY_ENABLED)
  );
  if (srcDir) symlinkSync(srcDir, path.join(appDir, 'src'));
  return appDir;
}

describe('OpenNext family manifest', () => {
  it('matches the gateway dispatch table for enabled families', () => {
    expect(config.deny).toEqual(gateway.webFamilies.deny);
    const enabled = enabledFamilies(config);
    expect(gateway.webFamilies.families.map((family) => family.id)).toEqual(
      enabled.map((family) => family.id)
    );
    for (const family of enabled) {
      const routed = gateway.webFamilies.families.find(
        (candidate) => candidate.id === family.id
      );
      expect(routed, family.id).toBeDefined();
      expect(routed?.exact).toEqual(family.exact);
      expect(routed?.prefix).toEqual(family.prefix);
      expect(routed?.exclude).toEqual(family.exclude);
    }
  });

  it('declares held families with a reason and no build config', () => {
    const ids = config.families.map((family) => family.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const family of config.families) {
      expect(family.worker).toBe(`tuturuuu-web-${family.id}`);
      if (family.enabled) {
        expect(family.held, family.id).toBeNull();
        expect(family.wrangler, family.id).toBeTypeOf('string');
        // The gateway matches literal paths; dynamic segments need a matcher.
        for (const entry of [
          ...family.exact,
          ...family.prefix,
          ...family.exclude,
        ]) {
          expect(entry, family.id).not.toContain('[');
        }
      } else {
        expect(family.held, family.id).toMatch(/\S/u);
        expect(family.wrangler, family.id).toBeNull();
        expect(() => planPrune(family.id)).toThrow(/held/u);
        expect(() =>
          openNextFamilyNextConfig({
            WEB_OPENNEXT_FAMILY: family.id,
            GITHUB_SHA: 'b'.repeat(40),
          })
        ).toThrow(/held/u);
      }
      if (family.kind === 'pages') {
        expect(family.assetPrefix).toBe(`/_f/${family.id}`);
      } else {
        expect(family.assetPrefix).toBeNull();
      }
    }
  });

  it('gives every app route entry at most one family', () => {
    for (const rel of appRouteEntries()) {
      const routePath = routePathFor(rel);
      if (routePath === null) continue;
      if (PROBE_ENTRIES.includes(rel)) continue;
      const owners = config.families
        .filter((family) => familyOwns(family, config.deny, routePath))
        .map((family) => family.id);
      expect(owners.length, `${rel}: ${owners.join(', ')}`).toBeLessThan(2);
    }
  });

  it('names a committed route-free wrangler config per enabled family', () => {
    for (const family of enabledFamilies(config)) {
      const raw = readFileSync(
        new URL(`../../${family.wrangler}`, import.meta.url),
        'utf8'
      );
      expect(raw).toContain(`"name": "${family.worker}"`);
      expect(raw).toContain('"nodejs_compat"');
      expect(raw).toContain('"workers_dev": false');
      expect(raw).not.toMatch(/"routes"\s*:/u);
      const names = JSON.parse(
        readFileSync(
          new URL(`./${family.id}.env.json`, import.meta.url),
          'utf8'
        )
      ) as { requiredSecrets: string[]; unset: Record<string, string> };
      for (const secret of names.requiredSecrets) {
        expect(raw).toContain(`"${secret}"`);
      }
      for (const name of Object.keys(names.unset)) {
        expect(raw, name).not.toContain(`"${name}"`);
      }
    }
  });
});

describe('family route pruning', () => {
  it('keeps the public docs pages and the build probe', () => {
    const plan = planPrune('public-docs');
    expect(plan.keep).toContain('[locale]/(marketing)/changelog/page.tsx');
    expect(plan.keep).toContain('[locale]/(marketing)/docs/page.tsx');
    expect(plan.keep).toContain('[locale]/ui/components/page.tsx');
    expect(plan.keep).toContain(
      '[locale]/(marketing)/visualizations/horse-racing/page.tsx'
    );
    expect(plan.keep).toContain('api/build-info/route.ts');
    expect(plan.keep).not.toContain(
      '[locale]/(dashboard)/[wsId]/changelog/page.tsx'
    );
    expect(plan.keep).not.toContain('[locale]/(marketing)/documents/page.tsx');
    expect(plan.keep.filter((rel) => rel.startsWith('api/'))).toEqual([
      'api/build-info/route.ts',
    ]);
  });

  it('keeps exactly the api-identity routes', () => {
    const plan = planPrune(
      'api-identity',
      fixtureAppDir(path.join(DEFAULT_APP_DIR, 'src'))
    );
    expect(plan.keep).toEqual(API_IDENTITY_ROUTES);
    expect(plan.remove.length).toBeGreaterThan(500);
    expect(plan.remove).toContain('api/v1/auth/accounts/[accountId]/route.ts');
    for (const rel of plan.keep) {
      expect(rel.startsWith('api/v1/auth/accounts/'), rel).toBe(false);
    }
  });

  it('maps entries to URL patterns', () => {
    expect(routePathFor('(marketing)/api/x/route.ts')).toBe('/api/x');
    expect(routePathFor('[locale]/@modal/a/page.tsx')).toBe('/[locale]/a');
    expect(routePathFor('api/_lib/route.ts')).toBeNull();
    expect(isRouteEntry('route.ts')).toBe(true);
    expect(isRouteEntry('opengraph-image.png')).toBe(true);
    expect(isRouteEntry('layout.tsx')).toBe(false);
    expect(isRouteEntry('helpers.ts')).toBe(false);
  });

  it('refuses to delete anything outside a disposable checkout', () => {
    const appDir = fixtureAppDir();
    mkdirSync(path.join(appDir, 'src/app/api/health'), { recursive: true });
    mkdirSync(path.join(appDir, 'src/app/api/cron/x'), { recursive: true });
    writeFileSync(path.join(appDir, 'src/app/api/health/route.ts'), '');
    writeFileSync(path.join(appDir, 'src/app/api/cron/x/route.ts'), '');
    const plan = planPrune('api-identity', appDir);
    expect(plan.remove).toEqual(['api/cron/x/route.ts']);
    expect(() => applyPrune(plan, appDir)).toThrow(/disposable/u);
    writeFileSync(
      path.join(appDir, DISPOSABLE_MARKER),
      DISPOSABLE_MARKER_CONTENT
    );
    const receipt = applyPrune(plan, appDir);
    expect(receipt.keep).toEqual(['api/health/route.ts']);
    expect(() =>
      readFileSync(path.join(appDir, 'src/app/api/cron/x/route.ts'))
    ).toThrow();
  });
});

describe('family Next config', () => {
  const sha = 'a'.repeat(40);

  it('is empty without WEB_OPENNEXT_FAMILY', () => {
    expect(openNextFamilyNextConfig({})).toEqual({});
    expect(openNextFamilyNextConfig({ WEB_OPENNEXT_FAMILY: ' ' })).toEqual({});
  });

  it('pins the deployment and build id to the family and commit', async () => {
    const result = openNextFamilyNextConfig({
      WEB_OPENNEXT_FAMILY: 'public-docs',
      GITHUB_SHA: sha,
    });
    expect(result.deploymentId).toBe(`web-public-docs-${'a'.repeat(12)}`);
    expect(await result.generateBuildId?.()).toBe(sha);
    expect(result.assetPrefix).toBe('/_f/public-docs');
  });

  it('rejects unknown families and missing commits', () => {
    expect(() =>
      openNextFamilyNextConfig({ WEB_OPENNEXT_FAMILY: 'nope', GITHUB_SHA: sha })
    ).toThrow(/Unknown/u);
    expect(() =>
      openNextFamilyNextConfig({ WEB_OPENNEXT_FAMILY: 'public-docs' })
    ).toThrow(/SHA/u);
  });
});
