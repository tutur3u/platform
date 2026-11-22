import { dirname, resolve } from 'node:path';
import type { Plugin } from 'vite-plus';

const modulePrefix = '\0mail:node-require:';
const workerBuiltins = new Set([
  'buffer',
  'crypto',
  'dns',
  'events',
  'fs',
  'https',
  'path',
  'stream',
  'string_decoder',
  'url',
  'util',
]);

type BuiltinImport = {
  source: string;
  kind: string | undefined;
  mode: string;
  consumer: string;
  conditions: readonly string[];
};

const awsXmlBuilderEntry =
  /[/\\]@aws-sdk[/\\]xml-builder[/\\]dist-es[/\\]index\.js$/u;
const iconvEntry = /[/\\]iconv-lite[/\\]lib[/\\]index\.js$/u;
const iconvStreamHint =
  "Use iconv.enableStreamingAPI(require('stream')); to enable it.";

type WorkerBuild = Pick<BuiltinImport, 'mode' | 'consumer' | 'conditions'>;

function isWorkerBuild(input: WorkerBuild) {
  return (
    input.mode === 'build' &&
    input.consumer === 'server' &&
    input.conditions.includes('workerd')
  );
}

export function rewriteMailWorkerIconvDiagnostic(
  code: string,
  id: string,
  input: WorkerBuild
) {
  if (!iconvEntry.test(id) || !isWorkerBuild(input)) return;
  // Keep the conservative emitted-byte guard free of require examples in diagnostics.
  return code.replace(
    iconvStreamHint,
    'Pass the node:stream module to iconv.enableStreamingAPI() to enable it.'
  );
}

export function resolveMailWorkerBuiltin(input: BuiltinImport) {
  const builtin = input.source.replace(/^node:/u, '');
  if (
    workerBuiltins.has(builtin) &&
    input.kind === 'require-call' &&
    isWorkerBuild(input)
  )
    return `${modulePrefix}${builtin}`;
}

export function mailWorkerBuiltinModule(id: string) {
  if (!id.startsWith(modulePrefix)) return;
  const builtin = id.slice(modulePrefix.length);
  if (workerBuiltins.has(builtin))
    return `import builtin from "node:${builtin}";\nexport { builtin as "module.exports" };\n`;
}

export function mailWorkerBuiltins() {
  return {
    name: 'mail-worker-commonjs-builtins',
    apply: 'build',
    resolveId: {
      order: 'pre',
      filter: {
        id: /^(?:(?:node:)?(?:buffer|crypto|dns|events|fs|https|path|stream|string_decoder|url|util)|\.\/xml-parser)$/u,
      },
      handler(source, importer, options) {
        const environment = {
          mode: this.environment.mode,
          consumer: this.environment.config.consumer,
          conditions: this.environment.config.resolve.conditions,
        };

        // The browser entry requires DOMParser, which workerd does not provide.
        if (
          source === './xml-parser' &&
          importer &&
          awsXmlBuilderEntry.test(importer) &&
          isWorkerBuild(environment)
        ) {
          return resolve(dirname(importer), 'xml-parser.js');
        }

        return resolveMailWorkerBuiltin({
          ...environment,
          source,
          kind: options.kind,
        });
      },
    },
    transform: {
      filter: { id: iconvEntry },
      handler(code, id) {
        return rewriteMailWorkerIconvDiagnostic(code, id, {
          mode: this.environment.mode,
          consumer: this.environment.config.consumer,
          conditions: this.environment.config.resolve.conditions,
        });
      },
    },
    load: {
      filter: {
        id: /^\0mail:node-require:(?:buffer|crypto|dns|events|fs|https|path|stream|string_decoder|url|util)$/u,
      },
      handler: mailWorkerBuiltinModule,
    },
  } satisfies Plugin;
}
