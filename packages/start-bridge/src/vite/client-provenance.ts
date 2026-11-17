import { createHash } from 'node:crypto';
import { posix } from 'node:path';
import type { Plugin } from 'vite';

const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex');

function inspectImports(node: unknown, visit?: (source: string) => void): void {
  if (!node || typeof node !== 'object') return;
  if ('type' in node && node.type === 'ImportExpression') {
    if (
      !('source' in node) ||
      !node.source ||
      typeof node.source !== 'object' ||
      !('type' in node.source) ||
      node.source.type !== 'Literal' ||
      !('value' in node.source) ||
      typeof node.source.value !== 'string'
    )
      throw new Error('Client provenance: unresolved computed import');
    visit?.(node.source.value);
  } else if (
    'type' in node &&
    [
      'ImportDeclaration',
      'ExportNamedDeclaration',
      'ExportAllDeclaration',
    ].includes(String(node.type)) &&
    'source' in node &&
    node.source &&
    typeof node.source === 'object' &&
    'value' in node.source &&
    typeof node.source.value === 'string'
  ) {
    visit?.(node.source.value);
  }
  for (const value of Object.values(node)) {
    if (Array.isArray(value))
      value.forEach((entry) => inspectImports(entry, visit));
    else inspectImports(value, visit);
  }
}

/** Opt-in qualification gate. Install only in the client build environment. */
export function clientProvenancePlugin(): Plugin {
  const forbidden = (id: string) => {
    const normalized = id
      .replaceAll('\\', '/')
      .split('?')[0]
      ?.replace(/^\u0000?__vite-browser-external:/, '');
    return (
      normalized === 'async_hooks' ||
      normalized === 'node:async_hooks' ||
      /\/start-bridge\/src\/server\/request-(?:store|context)\.[cm]?[jt]s$/.test(
        normalized ?? ''
      )
    );
  };
  return {
    name: 'start-bridge-client-provenance',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const ids = new Set(this.getModuleIds());
      const modules = [...ids].sort().map((id) => {
        if (forbidden(id))
          this.error(`Server request store in client graph: ${id}`);
        const info = this.getModuleInfo(id);
        if (!info) this.error(`Missing module provenance: ${id}`);
        if ('isExternal' in info && info.isExternal === true)
          this.error(`External module lacks client provenance: ${id}`);
        if (info.code == null) this.error(`Missing transformed source: ${id}`);
        inspectImports(this.parse(info.code));
        const imports = [...info.importedIds].sort();
        const dynamicImports = [...info.dynamicallyImportedIds].sort();
        for (const dependency of [...imports, ...dynamicImports]) {
          if (!ids.has(dependency))
            this.error(`Missing dependency provenance: ${dependency}`);
          if (forbidden(dependency))
            this.error(`Server request store in client graph: ${dependency}`);
        }
        return {
          id,
          external: false,
          transformedSha256: hash(info.code),
          imports,
          dynamicImports,
        };
      });
      const chunks = Object.values(bundle)
        .filter((output) => output.type === 'chunk')
        .map((chunk) => {
          const checkChunkDependency = (dependency: string) => {
            const target = bundle[dependency];
            if (!target || target.type !== 'chunk')
              this.error(
                `Missing emitted dependency provenance: ${dependency}`
              );
          };
          for (const id of Object.keys(chunk.modules)) {
            if (!ids.has(id))
              this.error(`Missing emitted module provenance: ${id}`);
          }
          inspectImports(this.parse(chunk.code), (source) => {
            if (forbidden(source))
              this.error(`Server request store in client chunk: ${source}`);
            if (!source.startsWith('./') && !source.startsWith('../'))
              this.error(`Unqualified emitted import: ${source}`);
            checkChunkDependency(
              posix.normalize(posix.join(posix.dirname(chunk.fileName), source))
            );
          });
          for (const dependency of [...chunk.imports, ...chunk.dynamicImports])
            checkChunkDependency(dependency);
          return {
            fileName: chunk.fileName,
            sha256: hash(chunk.code),
            modules: Object.keys(chunk.modules).sort(),
            imports: chunk.imports,
            dynamicImports: chunk.dynamicImports,
          };
        })
        .sort((a, b) => a.fileName.localeCompare(b.fileName));
      if (!chunks.length) this.error('Missing client chunks');
      this.emitFile({
        type: 'asset',
        fileName: 'client-provenance.json',
        source: JSON.stringify(
          { schema: 1, computedImports: 'reject-unresolved', modules, chunks },
          null,
          2
        ),
      });
    },
  };
}
