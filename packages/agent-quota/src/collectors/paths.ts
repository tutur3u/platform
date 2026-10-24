import { join } from 'node:path';
import { stateRoot } from '../state-root';

export const ALLOWED_INSTANCE_IDS = [
  'codex_ai4ed',
  'codex',
  'claudeAgent',
  'claude_mira',
  'claude_kv',
  'claude_dd',
  'claude_hehe',
] as const;

export function defaultCollectorPaths(base = stateRoot()) {
  return {
    codexRoot: join(base, '.codex'),
    codexT3Root: join(base, '.codex-t3'),
    snapshotCacheDir: join(base, '.t3', 'caches'),
    t3StateDatabase: join(base, '.t3', 'userdata', 'statev2.sqlite'),
  };
}

export function codexRoots(): string[] {
  const paths = defaultCollectorPaths();
  return [paths.codexRoot, paths.codexT3Root];
}

export function codexRoot(instanceId: string): string | undefined {
  const paths = defaultCollectorPaths();
  if (instanceId === 'codex') return paths.codexRoot;
  if (instanceId === 'codex_ai4ed') return paths.codexT3Root;
  return;
}

// No guessed homes: settings may contain credentials and must not be read here.
export function claudeProjectsRoot(_instanceId: string): string | undefined {
  return undefined;
}

export function t3StateDatabase(): string {
  return defaultCollectorPaths().t3StateDatabase;
}

export function allowedSessionFile(path: string, roots: string[]): boolean {
  const normalized = path.replaceAll('\\', '/');
  return (
    roots.some((root) =>
      normalized.startsWith(`${root.replaceAll('\\', '/')}/`)
    ) && normalized.endsWith('.jsonl')
  );
}
