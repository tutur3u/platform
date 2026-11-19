import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { collectTechStack } from './collect-tech-stack.ts';

describe('roadmap tech stack', () => {
  it('uses production routes, separates staging and holds, and inventories non-web apps', () => {
    const root = mkdtempSync(join(tmpdir(), 'roadmap-tech-stack-'));
    const write = (name: string, body: unknown) => {
      mkdirSync(join(root, name, '..'), { recursive: true });
      writeFileSync(
        join(root, name),
        typeof body === 'string' ? body : JSON.stringify(body)
      );
    };
    const dual = {
      dependencies: { next: '*', '@tanstack/react-start': '*' },
      devDependencies: { 'vite-plus': '*', void: '*' },
      scripts: { build: 'vp build' },
    };
    try {
      write('apps/gateway/src/manifest.json', {
        routes: [{ origin: 'start', exact: ['/start'], prefix: ['/start/'] }],
      });
      write('apps/next/package.json', dual);
      write('apps/next/vercel.json', { buildCommand: 'bun run build:legacy' });
      write(
        'apps/next/void.config.ts',
        "export default { target: 'cloudflare' };"
      );
      write('apps/next/wrangler.staging.jsonc', '{}');
      write(
        'tuturuuu.ci.ts',
        "export const productionPublicationPolicy = { next: { state: 'held' } };"
      );
      write('apps/start/package.json', dual);
      write(
        'apps/start/void.config.ts',
        "export default { target: 'cloudflare' };"
      );
      write('apps/vercel/package.json', { dependencies: { next: '*' } });
      write('apps/vercel/vercel.json', {});
      write('apps/open-next/package.json', {
        dependencies: { next: '*', '@opennextjs/cloudflare': '*' },
      });
      write('apps/open-next/wrangler.jsonc', '{}');
      write('apps/worker/cloudflare.config.ts', 'export default {};');
      write('apps/worker/package.json', {
        devDependencies: { 'vite-plus': '*' },
        scripts: { deploy: 'cf deploy --prebuilt' },
      });
      write('apps/legacy-worker/wrangler.toml', 'name = "legacy-worker"');
      write('apps/mobile/pubspec.yaml', 'name: mobile');
      write('apps/tanstack-web/package.json', dual);
      write('apps/tanstack-web/wrangler.jsonc', '{}');

      const apps = collectTechStack(root);
      const row = (id: string) => apps.find((app) => app.id === id);
      expect(apps).toHaveLength(9);
      expect(row('next')).toMatchObject({
        status: 'held',
        current: {
          framework: 'next',
          bundler: 'next',
          hosting: 'vercel',
          deployCli: null,
        },
      });
      expect(row('start')).toMatchObject({
        status: 'cutOver',
        current: {
          framework: 'start',
          bundler: 'vitePlusVoid',
          hosting: 'nativeWorker',
          deployCli: 'wrangler',
          url: 'https://tuturuuu.com/start',
        },
      });
      expect(row('vercel')).toMatchObject({
        status: 'candidate',
        current: { framework: 'next', hosting: 'vercel' },
      });
      expect(row('open-next')?.current).toMatchObject({
        framework: 'next',
        hosting: 'openNext',
        deployCli: 'wrangler',
      });
      expect(row('worker')).toMatchObject({
        status: 'outside',
        current: {
          framework: 'other',
          hosting: 'nativeWorker',
          deployCli: 'cf',
          url: null,
        },
      });
      expect(row('legacy-worker')?.current.deployCli).toBe('wrangler');
      expect(row('mobile')?.status).toBe('outside');
      expect(row('tanstack-web')).toMatchObject({
        status: 'paused',
        current: { hosting: null, url: null },
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
