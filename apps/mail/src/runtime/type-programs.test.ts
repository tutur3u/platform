import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const appRoot = resolve(__dirname, '../..');
const read = (path: string) =>
  JSON.parse(readFileSync(resolve(appRoot, path), 'utf8'));
const source = (path: string) => readFileSync(resolve(appRoot, path), 'utf8');

// Real CLI negatives probe host/resolution failures, not acceptance of the
// complete app or bridge, which the aggregate compiler command checks.
function negativeProgram(
  parent: string,
  probe: string | undefined,
  compilerOptions: object = {}
) {
  const fixtures = resolve(appRoot, '.typecheck');
  mkdirSync(fixtures, { recursive: true });
  const dir = mkdtempSync(join(fixtures, 'boundary-negative-'));
  try {
    if (probe !== undefined) writeFileSync(join(dir, 'probe.ts'), probe);
    writeFileSync(
      join(dir, 'tsconfig.json'),
      JSON.stringify({
        extends: resolve(appRoot, parent),
        compilerOptions,
        files: [
          probe === undefined
            ? resolve(appRoot, 'cloudflare/worker.ts')
            : './probe.ts',
        ],
        include: [],
        exclude: [],
      })
    );
    const result = spawnSync(
      'tsc',
      [
        '--noEmit',
        '--pretty',
        'false',
        '--project',
        join(dir, 'tsconfig.json'),
      ],
      { cwd: appRoot, encoding: 'utf8' }
    );
    if (result.error) throw result.error;
    expect(result.signal).toBeNull();
    expect(result.status).not.toBe(0);
    return { output: result.stdout + result.stderr, dir };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('complete app, genuine declaration bridge and actual Worker programs', () => {
  it('retains every app root and inherited semantic check in both app programs', () => {
    const app = read('tsconfig.json');
    const boundary = read('tsconfig.boundary.json');
    const host = read('tsconfig.config.json');
    const base = read('../../packages/typescript-config/base.json');
    expect(base.compilerOptions.strict).toBe(true);
    expect(app.include).toEqual([
      'src/**/*',
      'scripts/**/*',
      'messages/**/*.json',
    ]);
    expect(app.exclude).toEqual([
      'node_modules',
      'dist',
      '.turbo',
      '.typecheck',
      'cloudflare',
      'cloudflare-env.d.ts',
    ]);
    expect(app.compilerOptions.paths).toEqual({ '@/*': ['./src/*'] });
    expect(app.compilerOptions).toMatchObject({
      composite: false,
      declaration: false,
      declarationMap: false,
      noEmit: true,
      incremental: false,
      types: ['vite/client', 'node'],
      lib: ['ESNext', 'DOM', 'DOM.Iterable'],
    });
    expect(boundary.extends).toBe('./tsconfig.json');
    expect(boundary.compilerOptions).toEqual({
      composite: false,
      noEmit: false,
      declaration: true,
      declarationMap: true,
      emitDeclarationOnly: true,
      noEmitOnError: true,
      incremental: false,
      rootDir: '.',
      outDir: '.typecheck/app',
    });
    expect(boundary.include).toBeUndefined();
    expect(boundary.exclude).toBeUndefined();
    expect(host.extends).toBe('./tsconfig.json');
    expect(host.include).toEqual([
      'vite.config.ts',
      'void.config.ts',
      'vitest.config.ts',
      'next.config.ts',
    ]);
    expect(host.compilerOptions.types).toEqual(['node']);
    expect(host.compilerOptions.noEmit).toBe(true);
    for (const config of [app, boundary, host, read('tsconfig.worker.json')]) {
      expect(config.references).toBeUndefined();
      for (const key of ['noCheck', 'strict', 'skipLibCheck'])
        expect(config.compilerOptions[key]).toBeUndefined();
    }
  });

  it('uses only the emitted handler bridge for Worker checking and real source at runtime', () => {
    const worker = read('tsconfig.worker.json');
    expect(worker.compilerOptions).toMatchObject({
      composite: false,
      declaration: false,
      declarationMap: false,
      noEmit: true,
      incremental: false,
      lib: ['ESNext'],
      types: ['@cloudflare/workers-types'],
      paths: { '#mail-handler': ['./.typecheck/app/src/runtime/handler.d.ts'] },
    });
    expect(worker.include).toEqual([
      'cloudflare/**/*.ts',
      'cloudflare-env.d.ts',
    ]);
    expect(worker.compilerOptions.paths).toEqual({
      '#mail-handler': ['./.typecheck/app/src/runtime/handler.d.ts'],
    });
    expect(source('cloudflare/worker.ts')).toContain(
      "import { handleMailRequest } from '#mail-handler'"
    );
    expect(source('cloudflare/worker.ts')).toContain(
      'satisfies ExportedHandler<CloudflareEnv>'
    );
    expect(source('vite.config.ts')).toContain('find: /^#mail-handler$/u');
    expect(source('vite.config.ts')).toContain(
      "replacement: local('./src/runtime/handler.ts')"
    );
  });

  it('rejects an absent bridge despite the actual implementation source existing', () => {
    const result = negativeProgram('tsconfig.worker.json', undefined, {
      paths: { '#mail-handler': ['./absent/handler.d.ts'] },
    });
    expect(source('src/runtime/handler.ts')).toContain('handleMailRequest');
    expect(result.output).toMatch(/TS2307[^\n]*['"]#mail-handler['"]/u);
  });

  it('rejects DOM names in the Worker host', () => {
    const result = negativeProgram(
      'tsconfig.worker.json',
      'document.createElement("div"); export {};'
    );
    expect(result.output).toMatch(/TS(?:2304|2584)[^\n]*'document'/u);
  });

  it('rejects Worker globals in the DOM app host', () => {
    const result = negativeProgram(
      'tsconfig.json',
      'export type LeakedWorkerGlobal = ExportedHandler;'
    );
    expect(result.output).toMatch(/TS2304[^\n]*'ExportedHandler'/u);
  });

  it('requires all four compiler commands and preserves inherited Turbo contracts', () => {
    const pkg = read('package.json');
    const local = read('turbo.json');
    const root = read('../../turbo.json');
    expect(pkg.scripts['type-check']).toBe(
      'bun run type-check:app && bun run type-check:boundary && bun run type-check:worker && bun run type-check:config'
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
    expect(pkg.scripts['type-check:config']).toBe(
      'tsc --noEmit --project tsconfig.config.json'
    );
    expect(local.extends).toEqual(['//']);
    expect(local.tasks['type-check'].inputs).toBeUndefined();
    expect(local.tasks['type-check'].dependsOn).toBeUndefined();
    expect(local.tasks['type-check'].cache).toBeUndefined();
    expect(local.tasks['type-check'].outputs).toEqual([
      ...root.tasks['type-check'].outputs,
      '.typecheck/**',
    ]);
    expect(root.tasks['type-check'].dependsOn).toContain('^build');
    expect(root.tasks['type-check'].dependsOn).toContain('^type-check');
  });
});
