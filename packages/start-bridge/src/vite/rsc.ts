import { readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { basename, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { esmExternalRequirePlugin } from 'vite';

/**
 * Environment-aware resolution for RSC mode. Vite aliases are global, so the
 * specifiers whose server-component behaviour differs from the client
 * resolve here instead: in the `rsc` environment `next/navigation`,
 * `next-intl` and `next-intl/navigation` get server variants; everywhere else
 * the router-mode shims.
 * `next/font/*` resolves to inert font objects (fonts load from CSS).
 */
const own = (path: string) =>
  fileURLToPath(new URL(`../${path}`, import.meta.url));

const FONT_PREFIX = '\0tuturuuu-start-bridge-font:';

/** Export conditions and built-ins of a Cloudflare Worker environment. */
const WORKER_CONDITIONS = ['workerd', 'worker', 'module', 'browser'];
// Node built-ins, bare or `node:`-prefixed, served by workerd's nodejs_compat.
const NODE_BUILTIN = new RegExp(
  `^(?:node:)?(?:${builtinModules.map((name) => name.replace(/\//gu, '\\/')).join('|')})$`,
  'u'
);
const CLOUDFLARE_BUILTINS = [
  'cloudflare:email',
  'cloudflare:node',
  'cloudflare:sockets',
  'cloudflare:workers',
  'cloudflare:workflows',
];

export function importedNames(source: string, specifier: string) {
  const escaped = specifier.replace(/[.*+?^${}()|[\]\\/]/gu, '\\$&');
  const names = new Set<string>();
  const pattern = new RegExp(
    `import\\s+([^'";]+?)\\s+from\\s*['"]${escaped}['"]`,
    'gu'
  );
  for (const match of source.matchAll(pattern)) {
    const clause = match[1] ?? '';
    const named = /\{([^}]*)\}/u.exec(clause)?.[1];
    for (const part of named?.split(',') ?? []) {
      const name = part
        .trim()
        .split(/\s+as\s+/u)[0]
        ?.replace(/^type\s+/u, '');
      if (name && /^[A-Za-z_$][\w$]*$/u.test(name)) names.add(name);
    }
    if (/^[A-Za-z_$][\w$]*(?:\s*,|$)/u.test(clause.trim()))
      names.add('default');
  }
  return [...names].sort();
}

export function fontModule(names: readonly string[]) {
  const lines = [
    'const font = (family) => () => ({ className: "", variable: "", style: { fontFamily: family } });',
  ];
  for (const name of names)
    lines.push(
      name === 'default'
        ? 'export default font("inherit");'
        : `export const ${name} = font(${JSON.stringify(name.replace(/_/gu, ' '))});`
    );
  return `${lines.join('\n')}\n`;
}

export interface StartBridgeRscPluginOptions {
  navigation?: 'router' | 'document';
  /**
   * Extra `rsc` environment entries (name to module URL or absolute path).
   * Route handlers belong there, loaded from the Worker with
   * `import.meta.viteRsc.loadModule('rsc', name)`: `server-only` is valid
   * only in `rsc`, while the Worker entry is bundled in `ssr`. The page
   * registry belongs there too, so plugin-rsc's scan reaches every page (and
   * the client components and `'use server'` modules they import) before
   * Start's server-function resolver is populated.
   */
  rscEntries?: Readonly<Record<string, string | URL>>;
}

interface ResolveContext {
  environment?: { name: string };
  resolve?: (
    source: string,
    importer?: string,
    options?: { skipSelf?: boolean }
  ) => Promise<{ id: string } | null>;
}

interface RenderContext {
  environment?: { name: string };
  emitFile(file: {
    type: 'asset';
    name: string;
    originalFileName: string;
    source: Uint8Array;
  }): string;
  getFileName(referenceId: string): string;
}

/**
 * Wasm and binary data imported as modules, as Wrangler's CompiledWasm and
 * Data rules load them (`next/og`'s Workers port imports `resvg.wasm`,
 * `yoga.wasm` and its fallback font as `*.ttf.bin` and awaits their
 * contents). The rsc build is not a Cloudflare environment, so it mirrors
 * @cloudflare/vite-plugin's additional modules: the import stays external,
 * the file is emitted beside the chunk, and Wrangler's default module rules
 * type it at runtime.
 */
const BINARY_MODULE = /\.(?:wasm(?:\?module)?|bin)$/u;
const BINARY_MARKER = '__TUTURUUU_BRIDGE_BINARY_MODULE__';
const BINARY_REFERENCE = new RegExp(
  `${BINARY_MARKER}(.+?)${BINARY_MARKER}`,
  'gu'
);

const binaryReference = (file: string) =>
  `${BINARY_MARKER}${file}${BINARY_MARKER}`;

export function startBridgeRscPlugin(
  options: StartBridgeRscPluginOptions = {}
) {
  const document = options.navigation === 'document';
  return {
    name: 'tuturuuu-start-bridge:rsc',
    enforce: 'pre' as const,
    // plugin-rsc imports the rsc entry as `<name>.js` from SSR, while Void's
    // Cloudflare output names server entries `.mjs`; pin the rsc naming.
    configEnvironment(name: string) {
      if (name !== 'rsc') return null;
      const input = Object.fromEntries(
        Object.entries(options.rscEntries ?? {}).map(([entry, module]) => [
          entry,
          module instanceof URL ? fileURLToPath(module) : module,
        ])
      );
      // Void hands the Cloudflare Worker options only to `ssr`, yet the rsc
      // output runs in the same Worker: mirror them (@cloudflare/vite-plugin's
      // worker environment). Bundle every dependency (no bare imports at
      // runtime), resolve Worker export conditions, keep `cloudflare:*`
      // external, and use the neutral platform so no Node `createRequire`
      // runtime is emitted.
      // Bundled CommonJS `require('child_process')` (e.g. googleapis) becomes
      // an ESM import of the built-in instead of a neutral-platform `require`
      // stub that throws at module load.
      return {
        resolve: {
          noExternal: true as const,
          conditions: WORKER_CONDITIONS,
          builtins: [...CLOUDFLARE_BUILTINS, NODE_BUILTIN],
        },
        build: {
          target: 'es2026',
          rollupOptions: {
            ...(Object.keys(input).length > 0 ? { input } : {}),
            platform: 'neutral' as const,
            plugins: [
              esmExternalRequirePlugin({
                external: [NODE_BUILTIN],
                skipDuplicateCheck: true,
              }),
            ],
            output: { entryFileNames: '[name].js' },
          },
        },
      };
    },
    resolveId(this: ResolveContext, source: string, importer?: string) {
      const rsc = this.environment?.name === 'rsc';
      if (rsc && importer && BINARY_MODULE.test(source)) {
        const clean = source.replace(/\?module$/u, '');
        if (clean.startsWith('.'))
          return {
            id: binaryReference(
              resolve(dirname(importer.split('?')[0] ?? importer), clean)
            ),
            external: true,
          };
        return (
          this.resolve?.(clean, importer, { skipSelf: true }) ??
          Promise.resolve(null)
        ).then((resolved) =>
          resolved
            ? {
                id: binaryReference(resolved.id.split('?')[0] ?? ''),
                external: true,
              }
            : null
        );
      }
      // Compiled packages also import `next/<module>.js`.
      const id = source.replace(/^(next\/[a-z-]+)\.js$/u, '$1');
      if (id === 'next/navigation')
        return own(
          rsc
            ? 'rsc/navigation.ts'
            : document
              ? 'next/navigation-document.tsx'
              : 'next/navigation.tsx'
        );
      if (id === 'next-intl')
        return own(rsc ? 'rsc/next-intl.tsx' : 'intl/use-intl.tsx');
      if (id === 'next-intl/navigation')
        return own(rsc ? 'rsc/intl-navigation.tsx' : 'intl/navigation.tsx');
      if ((id === 'next/font/google' || id === 'next/font/local') && importer) {
        const names = importedNames(
          readFileSync(importer.split('?')[0] ?? importer, 'utf8'),
          id
        );
        return `${FONT_PREFIX}${names.join(',')}`;
      }
      return null;
    },
    renderChunk(
      this: RenderContext,
      code: string,
      chunk: { fileName: string }
    ) {
      if (this.environment?.name !== 'rsc' || !code.includes(BINARY_MARKER))
        return null;
      return code.replace(BINARY_REFERENCE, (_, file: string) => {
        const emitted = this.getFileName(
          this.emitFile({
            type: 'asset',
            name: basename(file),
            originalFileName: file,
            source: readFileSync(file),
          })
        );
        const path = relative(dirname(chunk.fileName), emitted);
        return path.startsWith('.') ? path : `./${path}`;
      });
    },
    load(id: string) {
      if (!id.startsWith(FONT_PREFIX)) return null;
      return fontModule(
        id.slice(FONT_PREFIX.length).split(',').filter(Boolean)
      );
    },
  };
}
