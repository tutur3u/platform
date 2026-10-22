import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite-plus';

const local = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const publicPorts = new Map([
  ['@tuturuuu/satellite/workspace-actions', local('./workspace-actions.ts')],
  [
    '@tuturuuu/supabase/next/realtime-log-actions',
    local('./realtime-actions.ts'),
  ],
]);
const ports = new Map([
  [
    local('../../../../packages/satellite/src/utils/workspace-actions.ts'),
    local('./workspace-actions.ts'),
  ],
  [
    local('../../../../packages/supabase/src/next/realtime-log-actions.ts'),
    local('./realtime-actions.ts'),
  ],
]);

export function resolveMailActionPort(source: string, importer?: string) {
  if (!importer || importer.split('?')[0]?.endsWith('.server.ts')) return;
  const publicPort = publicPorts.get(source);
  if (publicPort) return publicPort;
  if (!source.startsWith('.')) return;
  const filename = resolve(importer.split('?')[0] ?? importer, '..', source);
  return ports.get(filename) ?? ports.get(`${filename}.ts`);
}
export function mailActionPorts(): Plugin {
  return {
    name: 'mail-native-action-ports',
    enforce: 'pre',
    resolveId: resolveMailActionPort,
  };
}
