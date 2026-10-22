import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  mailWorkerBuiltinModule,
  mailWorkerBuiltins,
  resolveMailWorkerBuiltin,
} from './worker-builtins-plugin';

const workerRequire = {
  source: 'path',
  kind: 'require-call',
  mode: 'build',
  consumer: 'server',
  conditions: ['workerd', 'module'],
};

describe('Mail CommonJS PostCSS builtin imports in Worker builds', () => {
  it.each(['path', 'node:path', 'url', 'node:url', 'fs', 'node:fs'])(
    'adapts %s to the native ESM builtin',
    (source) => {
      const id = resolveMailWorkerBuiltin({ ...workerRequire, source });
      expect(id).toBeDefined();
      const plugin = mailWorkerBuiltins();
      expect(plugin.apply).toBe('build');
      expect(plugin.resolveId.order).toBe('pre');
      const module = mailWorkerBuiltinModule(id ?? '');
      expect(plugin.load.handler(id ?? '')).toBe(module);
      expect(module).toContain(
        `import builtin from "node:${source.replace(/^node:/u, '')}"`
      );
      expect(module).toContain('export { builtin as "module.exports" }');
      expect(module).not.toMatch(/require\s*\(/u);
    }
  );

  it.each([
    { kind: 'import-statement' },
    { kind: undefined },
    { mode: 'dev' },
    { consumer: 'client' },
    { conditions: ['node', 'module'] },
    { source: 'child_process' },
  ])('preserves unrelated imports: %j', (change) => {
    expect(
      resolveMailWorkerBuiltin({ ...workerRequire, ...change })
    ).toBeUndefined();
  });

  it('uses the same Worker bundling adapter for both publication profiles', () => {
    const config = readFileSync(
      new URL('../../vite.config.ts', import.meta.url),
      'utf8'
    );
    expect(config).toContain('mailWorkerBuiltins(),');
    expect(config.indexOf('mailWorkerBuiltins(),')).toBeLessThan(
      config.indexOf('voidPlugin(),')
    );
    expect(config).not.toMatch(
      /process\.env\.(?:PROFILE|MAIL_DEPLOYMENT_PROFILE)/u
    );
  });
});
