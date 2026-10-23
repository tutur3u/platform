import { homedir } from 'node:os';
import { join } from 'node:path';

export const ALLOWED_INSTANCE_IDS = [
  'codex_ai4ed',
  'codex',
  'claudeAgent',
  'claude_mira',
  'claude_kv',
  'claude_dd',
  'claude_hehe',
] as const;

const CLAUDE_HOME_BY_INSTANCE: Record<string, string> = {
  claudeAgent: 'claude_hehe',
  claude_mira: 'claude_kv',
  claude_kv: 'claude_mira',
  claude_dd: 'claude_dd',
  claude_hehe: 'claude_skora',
};

export function codexRoots(): string[] {
  const home = homedir();
  return [join(home, '.codex'), join(home, '.codex-t3')];
}

export function codexRoot(instanceId: string): string | undefined {
  if (instanceId === 'codex') return join(homedir(), '.codex');
  if (instanceId === 'codex_ai4ed') return join(homedir(), '.codex-t3');
  return;
}

export function claudeProjectsRoot(instanceId: string): string | undefined {
  if (
    !ALLOWED_INSTANCE_IDS.includes(
      instanceId as (typeof ALLOWED_INSTANCE_IDS)[number]
    )
  )
    return;
  return join(
    homedir(),
    '.claude-t3',
    CLAUDE_HOME_BY_INSTANCE[instanceId] ?? instanceId,
    'projects'
  );
}

export function t3StateDatabase(): string {
  return join(homedir(), '.t3', 'userdata', 'statev2.sqlite');
}

export function allowedSessionFile(path: string, roots: string[]): boolean {
  const normalized = path.replaceAll('\\', '/');
  return (
    roots.some((root) =>
      normalized.startsWith(`${root.replaceAll('\\', '/')}/`)
    ) && normalized.endsWith('.jsonl')
  );
}
