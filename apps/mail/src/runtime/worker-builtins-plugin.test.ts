import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Transform } from 'node:stream';
import { describe, expect, it } from 'vitest';
import {
  mailWorkerBuiltinModule,
  mailWorkerBuiltins,
  resolveMailWorkerBuiltin,
  rewriteMailWorkerIconvDiagnostic,
} from './worker-builtins-plugin';

const workerRequire = {
  source: 'path',
  kind: 'require-call',
  mode: 'build',
  consumer: 'server',
  conditions: ['workerd', 'module'],
};

describe('Mail CommonJS builtin imports in Worker builds', () => {
  it.each([
    'buffer',
    'node:buffer',
    'crypto',
    'node:crypto',
    'dns',
    'node:dns',
    'https',
    'node:https',
    'events',
    'node:events',
    'string_decoder',
    'node:string_decoder',
    'util',
    'node:util',
    'path',
    'node:path',
    'url',
    'node:url',
    'fs',
    'node:fs',
    'stream',
    'node:stream',
  ])('adapts %s to the native ESM builtin', (source) => {
    const id = resolveMailWorkerBuiltin({ ...workerRequire, source });
    expect(id).toBeDefined();
    const plugin = mailWorkerBuiltins();
    expect(plugin.apply).toBe('build');
    expect(plugin.resolveId.order).toBe('pre');
    expect(plugin.resolveId.filter.id.test(source)).toBe(true);
    expect(plugin.load.filter.id.test(id ?? '')).toBe(true);
    const module = mailWorkerBuiltinModule(id ?? '');
    expect(plugin.load.handler(id ?? '')).toBe(module);
    expect(module).toContain(
      `import builtin from "node:${source.replace(/^node:/u, '')}"`
    );
    expect(module).toContain('export { builtin as "module.exports" }');
    expect(module).not.toMatch(/require\s*\(/u);
  });

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

describe('iconv-lite Worker diagnostic', () => {
  const require = createRequire(import.meta.url);
  const mailauth = createRequire(require.resolve('mailauth/lib/tools'));
  const libmime = createRequire(mailauth.resolve('libmime'));
  const entry = libmime.resolve('iconv-lite');
  const code = readFileSync(entry, 'utf8');

  it('changes only the require example in the installed dependency diagnostic', () => {
    const transformed = rewriteMailWorkerIconvDiagnostic(
      code,
      entry,
      workerRequire
    );
    expect(transformed).toBeDefined();
    expect(code).toContain('streamModule = require("stream")');
    expect(transformed).toContain('streamModule = require("stream")');
    expect(transformed).not.toContain(
      "Use iconv.enableStreamingAPI(require('stream')); to enable it."
    );
    expect(
      transformed?.replace(
        'Pass the node:stream module to iconv.enableStreamingAPI() to enable it.',
        "Use iconv.enableStreamingAPI(require('stream')); to enable it."
      )
    ).toBe(code);

    const dependency = { exports: {} };
    new Function('module', 'exports', 'require', transformed ?? '')(
      dependency,
      dependency.exports,
      createRequire(entry)
    );
    const iconv = libmime('iconv-lite');
    // The installed API owns the type; execute transformed dependency bytes.
    expect(dependency.exports).toMatchObject({
      decode: expect.any(Function),
      encodeStream: expect.any(Function),
    });
    const api = Object.assign({}, iconv, dependency.exports);
    expect(
      api.decode(Buffer.from([0x63, 0x61, 0x66, 0xe9]), 'windows-1252')
    ).toBe('café');
    expect(api.encodeStream('utf8')).toBeInstanceOf(Transform);
  });

  it.each([{ mode: 'dev' }, { consumer: 'client' }, { conditions: ['node'] }])(
    'preserves other environments: %j',
    (change) => {
      expect(
        rewriteMailWorkerIconvDiagnostic(code, entry, {
          ...workerRequire,
          ...change,
        })
      ).toBeUndefined();
    }
  );

  it('does not rewrite application code or other dependency entrypoints', () => {
    expect(
      rewriteMailWorkerIconvDiagnostic(code, '/app/src/index.js', workerRequire)
    ).toBeUndefined();
  });
});
