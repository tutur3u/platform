import { builtinModules } from 'node:module';
import { join, resolve } from 'node:path';
import { build, type Plugin } from 'esbuild';

// esbuild filters are Go regular expressions: no flags, no `\/` escapes.
const BUILTIN = new RegExp(
  `^(node:)?(${[...new Set(builtinModules.map((name) => name.replace(/^node:/u, '')))].join('|')})$`
);

/**
 * CommonJS dependencies (xml-crypto) `require("crypto")`. workerd exposes
 * Node built-ins as ES modules under `nodejs_compat`, so each `require` of
 * a built-in becomes a small module re-exporting its `node:` import, as the
 * Cloudflare Vite plugin does when it builds the Worker.
 */
const nodeBuiltins: Plugin = {
  name: 'node-builtins',
  setup(builder) {
    builder.onResolve({ filter: BUILTIN }, (args) =>
      args.kind === 'require-call'
        ? { path: args.path.replace(/^node:/u, ''), namespace: 'node-require' }
        : {
            path: args.path.startsWith('node:')
              ? args.path
              : `node:${args.path}`,
            external: true,
          }
    );
    builder.onLoad({ filter: /.*/, namespace: 'node-require' }, (args) => ({
      contents: `import m from 'node:${args.path}'; module.exports = m;`,
      loader: 'js',
    }));
  },
};

/**
 * Bundles src/worker.ts for Miniflare with the given build defines and
 * returns the script path. `PRODUCTION_DEFINES` with tree-shaking mirrors the
 * deployed build's dead-code removal.
 */
export async function bundleWorker(
  outDir: string,
  define: Readonly<Record<string, string>>
): Promise<string> {
  const scriptPath = join(outDir, 'worker.mjs');
  await build({
    define: { ...define },
    treeShaking: true,
    minifySyntax: true,
    entryPoints: [resolve(import.meta.dirname, '../worker.ts')],
    outfile: scriptPath,
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    mainFields: ['module', 'main'],
    conditions: ['workerd', 'worker', 'import'],
    external: ['cloudflare:*'],
    plugins: [nodeBuiltins],
    logLevel: 'silent',
  });
  return scriptPath;
}
