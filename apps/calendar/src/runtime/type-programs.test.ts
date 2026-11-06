import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

const appRoot = resolve(__dirname, '../..');
const configSchema = z.object({
  extends: z.string(),
  compilerOptions: z.record(z.string(), z.unknown()),
  include: z.array(z.string()),
  exclude: z.array(z.string()).optional(),
});
const config = (name: string) =>
  configSchema.parse(JSON.parse(readFileSync(join(appRoot, name), 'utf8')));

describe('Calendar native type host boundaries', () => {
  it('retains the full DOM app while separately checking both service-worker roots', () => {
    const app = config('tsconfig.json');
    const sw = config('tsconfig.sw.json');
    const build = config('tsconfig.config.json');
    expect(build.include).toEqual(['vite.config.mts', 'void.config.ts']);
    expect(build.compilerOptions.types).toEqual(['node']);
    expect(build.compilerOptions.noEmit).toBe(true);
    expect(app.include).toEqual(['src', 'global.d.ts', 'messages']);
    expect(app.compilerOptions.lib).toEqual(['ESNext', 'DOM', 'DOM.Iterable']);
    expect(app.compilerOptions.types).toEqual(['vite/client', 'node']);
    expect(app.compilerOptions.noEmit).toBe(true);
    expect(app.compilerOptions.composite).toBe(false);
    expect(app.exclude).toEqual([
      'node_modules',
      'dist',
      '.turbo',
      '.typecheck',
      'src/app/sw.ts',
      'src/runtime/offline-worker.ts',
      'src/runtime/offline-assets.test.ts',
    ]);
    expect(sw.include).toEqual([
      'src/app/sw.ts',
      'src/runtime/offline-worker.ts',
      'src/runtime/offline-assets.test.ts',
    ]);
    expect(sw.compilerOptions.lib).toEqual(['ESNext', 'WebWorker']);
    expect(sw.compilerOptions.types).toEqual(['node']);
    expect(sw.compilerOptions.noEmit).toBe(true);
    expect(sw.compilerOptions.noEmitOnError).toBe(true);
    // This real-worker test keeps its runtime discovery path and assertions.
    // It belongs to the WebWorker program, never to neither program.
    const offlineTest = 'src/runtime/offline-assets.test.ts';
    expect(app.include).toContain('src');
    expect(app.exclude).toContain(offlineTest);
    expect(sw.include.filter((path) => path === offlineTest)).toHaveLength(1);
    expect(sw.exclude).not.toContain(offlineTest);
  });
  it('checks the actual Worker only against genuine DOM handler declarations', () => {
    const worker = config('tsconfig.worker.json');
    const boundary = config('tsconfig.boundary.json');
    expect(worker.include).toEqual([
      'cloudflare/**/*.ts',
      'cloudflare-env.d.ts',
    ]);
    expect(worker.compilerOptions.lib).toEqual(['ESNext']);
    expect(worker.compilerOptions.types).toEqual(['@cloudflare/workers-types']);
    const paths = z
      .record(z.string(), z.array(z.string()))
      .parse(worker.compilerOptions.paths);
    expect(paths['#calendar-handler']).toEqual([
      './.typecheck/app/src/runtime/handler.d.ts',
    ]);
    expect(boundary.extends).toBe('./tsconfig.json');
    expect(boundary.include).toEqual(['src/runtime/handler.ts']);
    expect(boundary.compilerOptions).toMatchObject({
      emitDeclarationOnly: true,
      declaration: true,
      noEmit: false,
      noEmitOnError: true,
      composite: false,
      incremental: false,
      rootDir: '.',
      outDir: '.typecheck/app',
    });
    const entry = readFileSync(join(appRoot, 'cloudflare/worker.ts'), 'utf8');
    expect(entry).toContain("from '#calendar-handler'");
    expect(entry).toContain('satisfies ExportedHandler<CloudflareEnv>');
    const vite = readFileSync(join(appRoot, 'vite.config.mts'), 'utf8');
    expect(vite).toContain('find: /^#calendar-handler$/u');
    expect(vite).toContain("replacement: local('./src/runtime/handler.ts')");
  });
  it('requires app, declaration, actual Worker and service-worker checks in order', () => {
    const pkg = z
      .object({
        name: z.literal('@tuturuuu/calendar'),
        scripts: z.record(z.string(), z.string()),
      })
      .parse(JSON.parse(readFileSync(join(appRoot, 'package.json'), 'utf8')));
    expect(pkg.scripts['type-check']).toBe(
      'bun run type-check:app && bun run type-check:boundary && bun run type-check:worker && bun run type-check:sw && bun run type-check:config'
    );
    expect(pkg.scripts['type-check:app']).toBe(
      'tsc --noEmit --project tsconfig.json'
    );
    expect(pkg.scripts['type-check:boundary']).toBe(
      'tsc --project tsconfig.boundary.json'
    );
    expect(pkg.scripts['type-check:worker']).toBe(
      'tsc --noEmit --project tsconfig.worker.json'
    );
    expect(pkg.scripts['type-check:sw']).toBe(
      'tsc --noEmit --project tsconfig.sw.json'
    );
  });
});
