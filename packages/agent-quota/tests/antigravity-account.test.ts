import { execFileSync } from 'node:child_process';
import { renameSync, symlinkSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { expect, test, vi } from 'vitest';
import { collectAllWith } from '../src/collectors';
import {
  accountFromLog,
  collectAntigravityAccountMatches,
  refreshAntigravityAccount,
} from '../src/collectors/antigravity-account';

vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:child_process')>()),
  execFileSync: vi.fn(),
}));

const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex');
const line = (email: string) =>
  `server_oauth.go:42 OAuth: authenticated successfully as ${email}\n`;

test('matches only the newest instance profile log and coalesces shared quota', async () => {
  const home = await mkdtemp(join(tmpdir(), 'quota-account-test-'));
  const checkedAt = '2026-11-27T12:00:00Z';
  const instance = (id: string, file: string) =>
    join(
      home,
      '.t3/userdata/providers/antigravity',
      hash(id),
      'antigravity-acp/log',
      file
    );
  const latest = 'acp-server-20261127_120000-1.log';
  const save = async (file: string, content: string) => {
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, content);
  };
  vi.stubEnv('AGENT_QUOTA_STATE_ROOT', home);
  try {
    const cli = join(home, '.gemini/antigravity-cli');
    await save(
      join(cli, 'log/cli-20261127_120000.log'),
      line('shared@example.test')
    );
    await symlink('log/cli-20261127_120000.log', join(cli, 'cli.log'));
    expect(
      accountFromLog(line('old@example.test') + line('SHARED@example.test'))
    ).toBe(hash('shared@example.test'));
    await save(
      join(
        home,
        '.local/share/tuturuuu/orchestration/quota/antigravity-account.json'
      ),
      JSON.stringify({
        identity: hash('shared@example.test'),
        checkedAt,
        windows: [
          {
            id: 'gemini-weekly',
            kind: 'weekly',
            usedPercent: 21,
            resetsAt: '2026-12-03T16:48:23Z',
          },
        ],
      })
    );
    const accounts = ['antigravity', 'antigravity_2'].map((instanceId) => ({
      instanceId,
      provider: 'antigravity' as const,
      label: instanceId,
      windows: [],
    }));
    await save(instance('antigravity', latest), line('shared@example.test'));
    await save(
      instance('antigravity_2', 'acp-server-20261127_110000-1.log'),
      line('shared@example.test')
    );
    await save(instance('antigravity_2', latest), line('other@example.test'));
    const now = new Date('2026-11-27T12:10:00Z');
    const [primary, secondary] = await collectAntigravityAccountMatches(
      accounts,
      now
    );
    expect(primary?.windows[0]).toMatchObject({
      usedPercent: 21,
      source: `account-match:${instance('antigravity', latest)}`,
    });
    expect(secondary?.windows).toEqual([]);
    await save(instance('antigravity_2', latest), line('shared@example.test'));
    const matched = await collectAntigravityAccountMatches(accounts, now);
    expect(matched[0]?.accountIdentityHash).toBeTruthy();
    expect(matched[1]?.accountIdentityHash).toBe(
      matched[0]?.accountIdentityHash
    );
    const expired = await collectAntigravityAccountMatches(
      accounts,
      new Date('2026-11-27T12:12:00Z')
    );
    expect(expired.map((account) => account.accountIdentityHash)).toEqual(
      matched.map((account) => account.accountIdentityHash)
    );
    expect(expired.every((account) => account.windows.length === 0)).toBe(true);

    const tsv = await readFile(
      new URL('./fixtures/antigravity-usage.tsv', import.meta.url),
      'utf8'
    );
    const nextLog = join(cli, 'log/cli-20261127_120001.log');
    const binary = join(home, 'fake-antigravity');
    await save(nextLog, line('shared@example.test'));
    vi.mocked(execFileSync)
      .mockImplementationOnce(() => {
        const link = join(cli, 'cli.log.next');
        symlinkSync(nextLog, link);
        renameSync(link, join(cli, 'cli.log'));
        return tsv;
      })
      .mockReturnValue(tsv);
    await refreshAntigravityAccount(binary);
    expect(execFileSync).toHaveBeenCalledWith(
      binary,
      ['--print-timeout', '12s', '-p', '/usage'],
      expect.objectContaining({ timeout: 16_000 })
    );
    await expect(refreshAntigravityAccount(binary)).rejects.toThrow(
      'quota-account-unverified'
    );

    const collected = await collectAllWith({
      collectT3State: () => Promise.reject(new Error('synthetic')),
      collectCatalog: async () =>
        accounts.map(({ windows: _, ...account }) => ({
          ...account,
          models: [],
          modelOptions: {},
          available: true,
        })),
      collectSnapshot: async (account) => account,
      readBlockLedger: async () => ({
        version: 1 as const,
        blocks: [],
        usageImport: {
          providers: accounts.map(({ instanceId }) => ({
            instanceId,
            driver: 'antigravity',
            usageLimits: {
              checkedAt: new Date().toISOString(),
              windows: [],
              unavailable: true,
            },
          })),
        },
      }),
    });
    expect(
      collected.accounts.every((account) => account.windows.length === 4)
    ).toBe(true);
    expect(collected.accounts[0]?.windows[0]?.freshnessTtlMs).toBe(660_000);
  } finally {
    vi.resetAllMocks();
    vi.unstubAllEnvs();
    await rm(home, { recursive: true, force: true });
  }
});
