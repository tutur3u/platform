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

export function codexRoots(): string[] {
  return [stateRoot('.codex'), stateRoot('.codex-t3')];
}

export function codexRoot(instanceId: string): string | undefined {
  if (instanceId === 'codex') return stateRoot('.codex');
  if (instanceId === 'codex_ai4ed') return stateRoot('.codex-t3');
  return;
}

// No guessed homes: settings may contain credentials and must not be read here.
export function claudeProjectsRoot(_instanceId: string): string | undefined {
  return undefined;
}

export function t3StateDatabase(): string {
  return stateRoot('.t3', 'userdata', 'statev2.sqlite');
}

export function allowedSessionFile(path: string, roots: string[]): boolean {
  const normalized = path.replaceAll('\\', '/');
  return (
    roots.some((root) =>
      normalized.startsWith(`${root.replaceAll('\\', '/')}/`)
    ) && normalized.endsWith('.jsonl')
  );
}
