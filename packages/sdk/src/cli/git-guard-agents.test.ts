import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  AGENT_DENY_RULES,
  agentDenyStatus,
  agentSettingsFiles,
  applyAgentDenyRules,
  removeAgentDenyRules,
} from './git-guard-agents';

let home = '';
const read = (path: string) => JSON.parse(readFileSync(path, 'utf8'));

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'ttr-guard-agents-'));
  mkdirSync(join(home, '.claude'));
  mkdirSync(join(home, '.claude-t3', 'acct'), { recursive: true });
  mkdirSync(join(home, '.claude-t3', 'backups'), { recursive: true });
  mkdirSync(join(home, '.claude-t3', 'empty'), { recursive: true });
  writeFileSync(
    join(home, '.claude', 'settings.json'),
    JSON.stringify({
      theme: 'dark',
      permissions: { allow: ['Bash(ls)'], deny: ['Bash(rm -rf /)'] },
    })
  );
  writeFileSync(
    join(home, '.claude-t3', 'acct', 'settings.json'),
    JSON.stringify({ includeCoAuthoredBy: false })
  );
  writeFileSync(join(home, '.claude-t3', 'backups', 'settings.json'), '{}');
});

afterEach(() => rmSync(home, { recursive: true, force: true }));

describe('agent MCP deny rules', () => {
  it('finds the default and per-account settings, skipping backups', () => {
    expect(agentSettingsFiles(home, {}).sort()).toEqual(
      [
        join(home, '.claude', 'settings.json'),
        join(home, '.claude-t3', 'acct', 'settings.json'),
      ].sort()
    );
  });

  it('only adds rules, backs up once, is idempotent and reversible', async () => {
    const files = agentSettingsFiles(home, {});
    const backupDir = join(home, 'guard-backups');
    const first = await applyAgentDenyRules({ files, backupDir });
    const main = read(files.find((file) => file.includes('.claude/'))!);
    expect(main.theme).toBe('dark');
    expect(main.permissions.allow).toEqual(['Bash(ls)']);
    expect(main.permissions.deny).toEqual([
      'Bash(rm -rf /)',
      ...AGENT_DENY_RULES,
    ]);
    expect(readdirSync(backupDir)).toHaveLength(2);

    const second = await applyAgentDenyRules({
      files,
      backupDir,
      previous: first,
    });
    expect(second).toEqual(first);
    expect(readdirSync(backupDir)).toHaveLength(2);
    expect((await agentDenyStatus(files)).every((entry) => entry.denied)).toBe(
      true
    );

    await removeAgentDenyRules(second);
    const restored = read(files.find((file) => file.includes('.claude/'))!);
    expect(restored.permissions).toEqual({
      allow: ['Bash(ls)'],
      deny: ['Bash(rm -rf /)'],
    });
    const account = read(files.find((file) => file.includes('acct'))!);
    expect(account).toEqual({ includeCoAuthoredBy: false });
  });

  it('keeps a rule the user already had when uninstalling', async () => {
    const file = join(home, '.claude-t3', 'acct', 'settings.json');
    writeFileSync(
      file,
      JSON.stringify({ permissions: { deny: [AGENT_DENY_RULES[0]] } })
    );
    const records = await applyAgentDenyRules({
      files: [file],
      backupDir: join(home, 'b'),
    });
    expect(records[0]!.added).not.toContain(AGENT_DENY_RULES[0]);
    await removeAgentDenyRules(records);
    expect(read(file).permissions.deny).toEqual([AGENT_DENY_RULES[0]]);
  });

  it('refuses malformed settings without writing', async () => {
    const file = join(home, '.claude-t3', 'acct', 'settings.json');
    writeFileSync(file, JSON.stringify({ permissions: { deny: 'all' } }));
    await expect(
      applyAgentDenyRules({ files: [file], backupDir: join(home, 'b') })
    ).rejects.toThrow('permissions.deny');
    expect(existsSync(join(home, 'b'))).toBe(false);
  });
});
