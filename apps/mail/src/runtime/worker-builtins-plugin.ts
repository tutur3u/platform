import type { Plugin } from 'vite-plus';

const modulePrefix = '\0mail:node-require:';
const postcssBuiltins = new Set(['fs', 'path', 'url']);

type BuiltinImport = {
  source: string;
  kind: string | undefined;
  mode: string;
  consumer: string;
  conditions: readonly string[];
};

export function resolveMailWorkerBuiltin(input: BuiltinImport) {
  const builtin = input.source.replace(/^node:/u, '');
  if (
    postcssBuiltins.has(builtin) &&
    input.kind === 'require-call' &&
    input.mode === 'build' &&
    input.consumer === 'server' &&
    input.conditions.includes('workerd')
  )
    return `${modulePrefix}${builtin}`;
}

export function mailWorkerBuiltinModule(id: string) {
  if (!id.startsWith(modulePrefix)) return;
  const builtin = id.slice(modulePrefix.length);
  if (postcssBuiltins.has(builtin))
    return `import builtin from "node:${builtin}";\nexport { builtin as "module.exports" };\n`;
}

export function mailWorkerBuiltins() {
  return {
    name: 'mail-worker-postcss-builtins',
    apply: 'build',
    resolveId: {
      order: 'pre',
      filter: { id: /^(?:node:)?(?:fs|path|url)$/u },
      handler(source, _importer, options) {
        return resolveMailWorkerBuiltin({
          source,
          kind: options.kind,
          mode: this.environment.mode,
          consumer: this.environment.config.consumer,
          conditions: this.environment.config.resolve.conditions,
        });
      },
    },
    load: {
      filter: { id: /^\0mail:node-require:(?:fs|path|url)$/u },
      handler: mailWorkerBuiltinModule,
    },
  } satisfies Plugin;
}
