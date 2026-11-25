import type { Plugin } from 'vite';
import { assetHeadersRules, buildCommit } from './build-stamp';

/** Build-time constant the Worker entry reads (see worker-entry.ts). */
export const BUILD_COMMIT_DEFINE = '__TUTURUUU_BUILD_COMMIT__';

/**
 * Bakes the build commit (`PLATFORM_BUILD_COMMIT`, set by build-family.sh)
 * into the Worker bundle and the client assets' `_headers`. The value lives in
 * the uploaded code, so it does not depend on deploy-time environment. An
 * absent or malformed commit bakes an empty value and emits no `_headers`.
 */
export function buildStamp(commitValue: unknown): Plugin {
  const commit = buildCommit(commitValue) ?? '';
  return {
    name: 'tuturuuu:build-stamp',
    config: () => ({
      define: { [BUILD_COMMIT_DEFINE]: JSON.stringify(commit) },
    }),
    generateBundle(_options, bundle) {
      const environment = (this as { environment?: { name?: string } })
        .environment;
      if (environment?.name !== 'client') return;
      const rules = assetHeadersRules(commit);
      if (!rules) return;
      const existing = bundle._headers;
      if (existing && existing.type === 'asset') {
        const text =
          typeof existing.source === 'string'
            ? existing.source
            : new TextDecoder().decode(existing.source);
        existing.source = `${text.trimEnd()}\n${rules}`;
        return;
      }
      this.emitFile({ type: 'asset', fileName: '_headers', source: rules });
    },
  };
}
