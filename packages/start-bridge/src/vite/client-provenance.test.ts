import { createHash } from 'node:crypto';
import { parse } from 'acorn';
import { describe, expect, it, vi } from 'vitest';
import { clientProvenancePlugin } from './client-provenance';

function qualify(
  code = 'export const value = 42;',
  id = '/entry.js',
  external = false,
  dependencies: string[] = [],
  emittedCode = code,
  emittedImports: string[] = []
) {
  const emitFile = vi.fn();
  const hook = clientProvenancePlugin().generateBundle;
  if (typeof hook !== 'function') throw new Error('Missing qualification hook');
  Reflect.apply(
    hook,
    {
      getModuleIds: () => [id],
      getModuleInfo: () => ({
        code,
        isExternal: external,
        importedIds: dependencies,
        dynamicallyImportedIds: [],
      }),
      parse: (source: string) =>
        parse(source, { ecmaVersion: 'latest', sourceType: 'module' }),
      error: (message: string) => {
        throw new Error(message);
      },
      emitFile,
    },
    [
      {},
      {
        'entry.js': {
          type: 'chunk',
          fileName: 'entry.js',
          code: emittedCode,
          modules: { [id]: {} },
          imports: emittedImports,
          dynamicImports: [],
        },
      },
    ]
  );
  return JSON.parse(emitFile.mock.calls[0]?.[0].source);
}

describe('client provenance qualification', () => {
  it('binds graph and chunk bytes', () => {
    const receipt = qualify();
    expect(receipt.modules[0].transformedSha256).toBe(
      createHash('sha256').update('export const value = 42;').digest('hex')
    );
    expect(receipt.chunks[0].sha256).toBe(receipt.modules[0].transformedSha256);
    expect(receipt.computedImports).toBe('reject-unresolved');
  });
  it.each([
    'node:async_hooks',
    'async_hooks',
    '__vite-browser-external:node:async_hooks',
    '/start-bridge/src/server/request-store.ts?x',
    '/start-bridge/src/server/request-context.ts',
  ])('rejects forbidden module %s', (id) => {
    expect(() => qualify('', id)).toThrow('Server request store');
  });
  it('accepts static and dynamic imports between emitted split chunks', () => {
    const emitFile = vi.fn();
    const hook = clientProvenancePlugin().generateBundle;
    if (typeof hook !== 'function')
      throw new Error('Missing qualification hook');
    const chunks = [
      {
        fileName: 'assets/entry.js',
        code: "import { value } from './shared.js'; export { value }; export const load = () => import('../lazy.js');",
        imports: ['assets/shared.js'],
        dynamicImports: ['lazy.js'],
      },
      {
        fileName: 'assets/shared.js',
        code: 'export const value = 42;',
        imports: [],
        dynamicImports: [],
      },
      {
        fileName: 'lazy.js',
        code: 'export const lazy = true;',
        imports: [],
        dynamicImports: [],
      },
    ];
    Reflect.apply(
      hook,
      {
        getModuleIds: () => chunks.map((chunk) => `/${chunk.fileName}`),
        getModuleInfo: () => ({
          code: 'export const value = 42;',
          importedIds: [],
          dynamicallyImportedIds: [],
        }),
        parse: (source: string) =>
          parse(source, { ecmaVersion: 'latest', sourceType: 'module' }),
        error: (message: string) => {
          throw new Error(message);
        },
        emitFile,
      },
      [
        {},
        Object.fromEntries(
          chunks.map((chunk) => [
            chunk.fileName,
            {
              ...chunk,
              type: 'chunk',
              modules: { [`/${chunk.fileName}`]: {} },
            },
          ])
        ),
      ]
    );
    const receipt = JSON.parse(emitFile.mock.calls[0]?.[0].source);
    expect(receipt.chunks).toHaveLength(3);
    expect(
      receipt.chunks.find(
        (chunk: { fileName: string }) => chunk.fileName === 'assets/entry.js'
      )
    ).toMatchObject({
      imports: ['assets/shared.js'],
      dynamicImports: ['lazy.js'],
    });
    for (const chunk of chunks) {
      expect(
        receipt.chunks.find(
          (entry: { fileName: string }) => entry.fileName === chunk.fileName
        ).sha256
      ).toBe(createHash('sha256').update(chunk.code).digest('hex'));
    }
  });
  it('refuses computed imports', () => {
    expect(() => qualify('export const load = name => import(name);')).toThrow(
      'unresolved computed import'
    );
  });
  it('refuses dependencies absent from the graph', () => {
    expect(() => qualify('', '/entry.js', false, ['external'])).toThrow(
      'Missing dependency provenance'
    );
  });
  it('refuses external module evidence', () => {
    expect(() => qualify('', 'external', true)).toThrow('External module');
  });
  it.each([
    'export const load = name => import(name);',
    "import('node:async_hooks');",
    "import './missing.js';",
    "export * from './missing.js';",
  ])(
    'refuses unqualified emitted imports with a clean module graph: %s',
    (code) => {
      expect(() => qualify('', '/entry.js', false, [], code)).toThrow();
    }
  );
  it('refuses emitted dependency metadata absent from the bundle', () => {
    expect(() =>
      qualify('', '/entry.js', false, [], '', ['missing.js'])
    ).toThrow('Missing emitted dependency provenance');
  });
});
