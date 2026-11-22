import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  appRouteEntries,
  DEFAULT_APP_DIR,
  inSubtree,
  loadFamilies,
  PROBE_ENTRIES,
  routePathFor,
} from '../opennext/prune';
import { loadVinextFamilies, planVinextPrune } from './prune';

const { config } = loadVinextFamilies();
const { deny } = loadFamilies().config;
const plans = config.families
  .filter((family) => family.enabled)
  .map((family) => planVinextPrune(family.id));

function isNodeOnly(rel: string) {
  const routePath = routePathFor(rel);
  return (
    routePath !== null &&
    config.nodeOnly.some((entry) => inSubtree(routePath, entry))
  );
}

describe('vinext route families', () => {
  it('assigns every routable entry except Node-only ones to exactly one family', () => {
    const owners = new Map<string, string[]>();
    for (const plan of plans) {
      for (const rel of plan.keep) {
        if (PROBE_ENTRIES.includes(rel)) continue;
        owners.set(rel, [...(owners.get(rel) ?? []), plan.family]);
      }
    }
    for (const rel of appRouteEntries()) {
      if (PROBE_ENTRIES.includes(rel) || routePathFor(rel) === null) continue;
      expect(owners.get(rel) ?? [], rel).toHaveLength(isNodeOnly(rel) ? 0 : 1);
    }
  });

  it('keeps the global deny list in api-ops only', () => {
    for (const plan of plans) {
      for (const rel of plan.keep) {
        if (PROBE_ENTRIES.includes(rel)) continue;
        const routePath = routePathFor(rel) as string;
        const denied = deny.some((entry) => inSubtree(routePath, entry));
        expect(denied, `${plan.family}: ${rel}`).toBe(
          plan.family === 'api-ops'
        );
      }
    }
  });

  it('serves the sharp image routes from api-core', () => {
    const { keep } = planVinextPrune('api-core');
    expect(keep).toContain('api/v1/users/me/avatar/upload/route.ts');
    expect(keep).toContain('api/v1/product-feedback/route.ts');
  });

  it('serves the ChatGPT credential routes from api-ops', () => {
    expect(config.nodeOnly).toEqual([]);
    const { keep } = planVinextPrune('api-ops');
    for (const rel of [
      'api/ai/chatgpt/route.ts',
      'api/ai/chatgpt/new/route.ts',
      'api/v1/users/chatgpt/route.ts',
    ]) {
      expect(keep).toContain(rel);
    }
  });

  it('binds the ChatGPT credential bucket on api-ops only', async () => {
    const workerEnv = async (family?: string) => {
      vi.resetModules();
      if (family) vi.stubEnv('WEB_VINEXT_FAMILY', family);
      else vi.stubEnv('WEB_VINEXT_FAMILY', '');
      const { default: config } = await import('../../cloudflare.config');
      vi.unstubAllEnvs();
      return (config as { worker: { env: Record<string, unknown> } }).worker
        .env;
    };
    expect((await workerEnv('api-ops')).CHATGPT_FILES).toMatchObject({
      type: 'r2',
      name: 'tuturuuu-web-chatgpt-files',
    });
    expect((await workerEnv()).CHATGPT_FILES).toMatchObject({ type: 'r2' });
    for (const family of ['api-core', 'public-auth', 'dashboard', 'web-rest']) {
      expect((await workerEnv(family)).CHATGPT_FILES, family).toBeFalsy();
    }
  });

  it('binds Cron Control on api-core only', async () => {
    const workerEnv = async (family?: string) => {
      vi.resetModules();
      vi.stubEnv('WEB_VINEXT_FAMILY', family ?? '');
      const { default: config } = await import('../../cloudflare.config');
      vi.unstubAllEnvs();
      return (config as { worker: { env: Record<string, unknown> } }).worker
        .env;
    };
    expect((await workerEnv('api-core')).CRON_CONTROL).toMatchObject({
      type: 'worker',
      worker: 'tuturuuu-cron-control',
    });
    expect((await workerEnv()).CRON_CONTROL).toMatchObject({ type: 'worker' });
    for (const family of ['api-ops', 'public-auth', 'dashboard', 'web-rest']) {
      expect((await workerEnv(family)).CRON_CONTROL, family).toBeFalsy();
    }
  });

  it('places the API families in a Gemini-supported region', async () => {
    const placement = async (family?: string) => {
      vi.resetModules();
      vi.stubEnv('WEB_VINEXT_FAMILY', family ?? '');
      const { default: config } = await import('../../cloudflare.config');
      vi.unstubAllEnvs();
      return (config as { worker: { placement?: unknown } }).worker.placement;
    };
    const singapore = { region: 'aws:ap-southeast-1' };
    expect(await placement()).toEqual(singapore);
    for (const { id, kind } of config.families) {
      const expected = kind === 'api' ? singapore : undefined;
      expect(await placement(id), id).toEqual(expected);
    }
  });

  it('keeps the localized sign-in and landing pages in public-auth', () => {
    const { keep } = planVinextPrune('public-auth');
    expect(keep).toContain('[locale]/(auth)/login/page.tsx');
    expect(keep).toContain('[locale]/(marketing)/(landing)/page.tsx');
    expect(keep.some((rel) => rel.includes('(marketing)/changelog'))).toBe(
      false
    );
  });

  it('splits the workspace apps out of dashboard', () => {
    const dashboard = planVinextPrune('dashboard').keep;
    const apps = planVinextPrune('dashboard-apps').keep;
    for (const keep of [dashboard, apps]) {
      expect(keep).toContain('api/build-info/route.ts');
    }
    const app = (rel: string) =>
      /^\/\[locale\]\/\[wsId\]\/(tasks|whiteboards|mind|documents|calendar|habits|notes|inventory|epm)(\/|$)/.test(
        routePathFor(rel) ?? ''
      );
    expect(apps.filter((rel) => !PROBE_ENTRIES.includes(rel)).every(app)).toBe(
      true
    );
    expect(dashboard.some(app)).toBe(false);
    expect(dashboard).toContain(
      '[locale]/(dashboard)/[wsId]/(dashboard)/page.tsx'
    );
  });

  // vinext compiles every kept entry, so an entry that imports another
  // route entry (a page re-rendering a sibling page) needs both in one family.
  it('keeps every route entry that a kept entry imports', () => {
    const appSrc = path.join(DEFAULT_APP_DIR, 'src/app');
    const importPattern = /(?:from|import\()\s*['"]((?:\.|@\/)[^'"]+)['"]/g;
    for (const family of config.families.filter((f) => f.enabled)) {
      const { keep, remove } = planVinextPrune(family.id);
      const removed = new Set(remove.map((rel) => path.join(appSrc, rel)));
      for (const rel of keep) {
        const file = path.join(appSrc, rel);
        for (const [, spec] of readFileSync(file, 'utf8').matchAll(
          importPattern
        )) {
          const target = spec.startsWith('@/')
            ? path.join(DEFAULT_APP_DIR, 'src', spec.slice(2))
            : path.resolve(path.dirname(file), spec);
          const hit = ['', '.ts', '.tsx'].find((ext) =>
            removed.has(target + ext)
          );
          expect(hit, `${family.id}: ${rel} imports ${spec}`).toBeUndefined();
        }
      }
    }
  });
});
