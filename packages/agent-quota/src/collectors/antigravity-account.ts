import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { constants } from 'node:fs';
import {
  lstat,
  mkdir,
  mkdtemp,
  open,
  readdir,
  realpath,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join } from 'node:path';
import { parseAntigravityUsage } from '../antigravity-usage';
import { assertSafeStateWrite, stateRoot } from '../state-root';
import type { AccountUsage } from '../types';
import { snapshotWindows } from '../usage-import';
import { ANTIGRAVITY_ACCOUNT_TTL_MS } from '../window-freshness';
import {
  antigravityLogDirectory,
  antigravityProfile,
  oldAntigravityProfile,
} from './antigravity-profile';

const digest = (value: string) =>
  createHash('sha256').update(value).digest('hex');
const cachePath = () =>
  stateRoot(
    '.local/share/tuturuuu/orchestration/quota/antigravity-account.json'
  );

export function accountFromLog(log: string): string | undefined {
  const matches = log.matchAll(
    /server_oauth\.go[^\r\n]*?OAuth: authenticated successfully as ([^\s@]+@[^\s@]+)(?=\s|$)/g
  );
  let latest: string | undefined;
  for (const match of matches) latest = match[1]?.toLowerCase();
  return latest ? digest(latest) : undefined;
}

async function readFileBounded(path: string, maxBytes: number) {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > maxBytes) throw new Error('invalid-file');
    const buffer = Buffer.alloc(stat.size);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    return buffer.toString('utf8', 0, bytesRead);
  } finally {
    await file.close();
  }
}

async function accountAt(path: string) {
  const identity = accountFromLog(
    await readFileBounded(path, 32 * 1024 * 1024)
  );
  return identity && { identity, path };
}

async function defaultAccount() {
  const dir = await realpath(stateRoot('.gemini/antigravity-cli/log'));
  const path = await realpath(stateRoot('.gemini/antigravity-cli/cli.log'));
  if (dirname(path) !== dir || !/^cli-\d{8}_\d{6}\.log$/.test(basename(path)))
    return;
  return accountAt(path);
}

async function latestInstanceLog(dir: string) {
  const logs = (await readdir(dir))
    .filter((name) => /^acp-server-\d{8}_\d{6}-\d+\.log$/.test(name))
    .sort();
  const latest = logs.at(-1);
  if (!latest) return;
  const current = logs.filter(
    (name) => name.slice(0, 26) === latest.slice(0, 26)
  );
  if (current.length === 1) return join(dir, latest);
  const candidates = await Promise.all(
    current.map(async (name) => {
      const path = join(dir, name);
      return { path, time: (await lstat(path)).birthtimeMs };
    })
  );
  candidates.sort((a, b) => b.time - a.time);
  const [first, second] = candidates;
  if (!first || first.time === second?.time)
    throw new Error('ambiguous-instance-log');
  return first.path;
}

async function instanceAccount(instanceId: string, renameEntries: unknown) {
  const root = stateRoot();
  const current = antigravityProfile(root, instanceId);
  const old = oldAntigravityProfile(root, instanceId, renameEntries);
  for (const profile of old ? [current, old] : [current]) {
    const dir = await antigravityLogDirectory(root, profile);
    if (!dir) continue;
    const log = await latestInstanceLog(dir);
    if (log) return accountAt(log);
  }
}

export async function refreshAntigravityAccount(binary: string) {
  const path = cachePath();
  assertSafeStateWrite(path);
  if (!isAbsolute(binary)) throw new Error('binary-path-required');
  const account = await defaultAccount();
  if (!account) throw new Error('default-account-unverified');
  const cwd = await mkdtemp(join(tmpdir(), 'antigravity-usage-'));
  try {
    const tsv = execFileSync(
      binary,
      ['--print-timeout', '12s', '-p', '/usage'],
      {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 16_000,
        maxBuffer: 128 * 1024,
      }
    );
    const after = await defaultAccount();
    if (
      !after ||
      after.path === account.path ||
      after.identity !== account.identity
    )
      throw new Error('quota-account-unverified');
    const windows = parseAntigravityUsage(tsv);
    const directory = dirname(path);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const temporary = await mkdtemp(join(directory, '.antigravity-'));
    try {
      const staged = join(temporary, 'account.json');
      await writeFile(
        staged,
        JSON.stringify({
          identity: after.identity,
          checkedAt: new Date().toISOString(),
          windows,
        }),
        { mode: 0o600 }
      );
      await rename(staged, path);
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

async function readMatchedQuota(now: Date) {
  try {
    const data = JSON.parse(await readFileBounded(cachePath(), 128 * 1024));
    const capturedAt = Date.parse(data.checkedAt);
    const age = now.getTime() - capturedAt;
    if (!(age >= 0 && age <= ANTIGRAVITY_ACCOUNT_TTL_MS)) return;
    const cli = await defaultAccount();
    if (!cli || cli.identity !== data.identity) return;
    return { identity: cli.identity, capturedAt, data };
  } catch {
    return;
  }
}

export async function collectAntigravityAccountMatches(
  accounts: AccountUsage[],
  now = new Date()
) {
  if (!accounts.some((account) => account.provider === 'antigravity'))
    return accounts;
  const [quota, renameEntries] = await Promise.all([
    readMatchedQuota(now),
    readFileBounded(
      stateRoot('.t3/scratch/automations/provider-rename-map.json'),
      128 * 1024
    )
      .then((contents): unknown => JSON.parse(contents))
      .catch(() => undefined),
  ]);
  return Promise.all(
    accounts.map(async (account) => {
      if (account.provider !== 'antigravity') return account;
      const instance = await instanceAccount(
        account.instanceId,
        renameEntries
      ).catch(() => undefined);
      if (!instance) return account;
      const identified = {
        ...account,
        accountIdentityHash: digest(`antigravity-account:${instance.identity}`),
      };
      if (quota?.identity !== instance.identity) return identified;
      try {
        const matched = snapshotWindows(account, quota.data);
        if (!matched.length) return identified;
        const windows = [...account.windows];
        for (const window of matched) {
          const index = window.id
            ? windows.findIndex((item) => item.id === window.id)
            : -1;
          const existing = windows[index];
          if (
            existing?.authoritative &&
            existing.freshnessTtlMs !== 0 &&
            Date.parse(existing.observedAt) > quota.capturedAt
          )
            continue;
          const replacement = {
            ...window,
            freshnessTtlMs: ANTIGRAVITY_ACCOUNT_TTL_MS,
            source: `account-match:${instance.path}`,
          };
          if (index < 0) windows.push(replacement);
          else windows[index] = replacement;
        }
        return { ...identified, lastError: undefined, windows };
      } catch {
        return identified;
      }
    })
  );
}
