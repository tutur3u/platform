import { createHash } from 'node:crypto';
import type { Plugin } from 'vite';

const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex');

function inspectImports(node: unknown): void {
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
  }
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(inspectImports);
    else inspectImports(value);
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
      const modules = [...this.getModuleIds()].sort().map((id) => {
        if (forbidden(id))
          this.error(`Server request store in client graph: ${id}`);
        const info = this.getModuleInfo(id);
        if (!info) this.error(`Missing module provenance: ${id}`);
        if (info.code === null) this.error(`Missing transformed source: ${id}`);
        inspectImports(this.parse(info.code));
        const imports = [...info.importedIds].sort();
        const dynamicImports = [...info.dynamicallyImportedIds].sort();
        for (const dependency of [...imports, ...dynamicImports]) {
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
        .map((chunk) => ({
          fileName: chunk.fileName,
          sha256: hash(chunk.code),
          modules: Object.keys(chunk.modules).sort(),
          imports: chunk.imports,
          dynamicImports: chunk.dynamicImports,
        }))
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
