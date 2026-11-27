import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { readHandbookFixture } from './ieeai';

const admin = {
  userId: 'fixture-user',
  workspaceId: 'a65cebd7-3a8c-4883-a3d9-82f9703d652f',
  role: 'admin',
  roleSources: ['role'],
};
const authenticate = async () => ({ valid: true, userId: admin.userId });

function cli(...args: string[]) {
  const result = spawnSync(
    'bun',
    [fileURLToPath(new URL('./index.ts', import.meta.url)), 'ieeai', ...args],
    { encoding: 'utf8' }
  );
  if (result.error) throw result.error;
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

test('CLI emits only the bounded handbook fixture payload', () => {
  const result = cli('handbook', 'stats', '--fixture');
  expect(result.status).toBe(0);
  expect(result.stderr).toBe('');
  expect(JSON.parse(result.stdout)).toEqual({
    source: 'fixture',
    from: '2026-11-26',
    to: '2026-11-26',
    timezone: 'Asia/Ho_Chi_Minh',
    rows: [
      { day: '2026-11-26', lang: 'vi', event: 'view', n: 12 },
      { day: '2026-11-26', lang: 'en', event: 'download', n: 3 },
    ],
  });
});

test('CLI rejects and hides unrecognized input', () => {
  expect(cli('--help').status).toBe(0);
  const { status, stderr, stdout } = cli(
    'handbook',
    'stats',
    'unexpected-input'
  );
  expect(status).toBe(1);
  expect(stderr).toBe(
    'Usage: ttr ieeai handbook stats --from <YYYY-MM-DD> --to <YYYY-MM-DD> | --fixture\n'
  );
  expect(stdout).toBe('');
});

test('denies mismatched identities and unverified administrator roles', async () => {
  for (const membership of [
    { ...admin, userId: 'other-user' },
    { ...admin, workspaceId: 'other-workspace' },
    { ...admin, role: 'member' },
    { ...admin, roleSources: ['fallback'] },
  ]) {
    await expect(readHandbookFixture(authenticate, membership)).rejects.toThrow(
      'IEEAI workspace administrator identity required.'
    );
  }
});

test('denies invalid identity and redacts authentication failures', async () => {
  await expect(
    readHandbookFixture(
      async () => ({ valid: false, userId: admin.userId }),
      admin
    )
  ).rejects.toThrow('IEEAI workspace administrator identity required.');
  await expect(
    readHandbookFixture(async () => {
      throw new Error('private identity detail');
    }, admin)
  ).rejects.toThrow('IEEAI workspace administrator identity required.');
});
