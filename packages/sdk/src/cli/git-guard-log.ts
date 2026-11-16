import { randomBytes } from 'node:crypto';
import {
  appendFile,
  mkdir,
  readdir,
  readFile,
  rename,
  writeFile,
} from 'node:fs/promises';
import { userInfo } from 'node:os';
import { join } from 'node:path';
import { gitGuardHome, guardPaths } from './git-guard-config';

export type GuardKind = 'push' | 'pr';

export interface GuardLogEntry {
  at: string;
  event:
    | 'refused'
    | 'allowed'
    | 'override-created'
    | 'override-consumed'
    | 'install'
    | 'uninstall';
  kind?: GuardKind;
  machine?: string;
  repo?: string;
  ref?: string;
  code?: string;
  reason?: string;
  approvedBy?: string;
  overrideId?: string;
  cwd?: string;
  user?: string;
}

export interface GuardOverride {
  id: string;
  kind: GuardKind;
  repo: string;
  /** Branch for push overrides; `*` matches any ref (PR overrides only). */
  ref: string;
  reason: string;
  approvedBy: string;
  createdAt: string;
  expiresAt: string;
  machine: string;
}

export const DEFAULT_OVERRIDE_TTL_MINUTES = 15;
const MAX_OVERRIDE_TTL_MINUTES = 120;

function currentUser() {
  try {
    return userInfo().username;
  } catch {
    return undefined;
  }
}

/** Append one JSON line; logging failures must never be silent to callers. */
export async function appendGuardLog(
  entry: Omit<GuardLogEntry, 'at' | 'user'>,
  home = gitGuardHome()
) {
  const path = guardPaths(home).log;
  await mkdir(home, { recursive: true, mode: 0o700 });
  const line: GuardLogEntry = {
    at: new Date().toISOString(),
    user: currentUser(),
    ...entry,
  };
  await appendFile(path, `${JSON.stringify(line)}\n`, { mode: 0o600 });
}

export async function readGuardLog(home = gitGuardHome(), limit = 20) {
  const text = await readFile(guardPaths(home).log, 'utf8').catch(() => '');
  const entries: GuardLogEntry[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line) as GuardLogEntry);
    } catch {
      // A torn line from a crashed writer is skipped, not fatal.
    }
  }
  return entries.slice(-limit);
}

export async function createOverride(
  input: {
    kind: GuardKind;
    repo: string;
    ref?: string;
    reason?: string;
    approvedBy?: string;
    ttlMinutes?: number;
    machine: string;
    now?: Date;
  },
  home = gitGuardHome()
) {
  const reason = input.reason?.trim();
  const approvedBy = input.approvedBy?.trim();
  if (!reason) throw new Error('allow-once needs --reason "<why>".');
  if (!approvedBy)
    throw new Error('allow-once needs --approved-by <who approved it>.');
  if (input.kind === 'push' && (!input.ref || input.ref === '*'))
    throw new Error('A push override needs an exact --ref <branch>.');
  const ttl = input.ttlMinutes ?? DEFAULT_OVERRIDE_TTL_MINUTES;
  if (!Number.isFinite(ttl) || ttl <= 0 || ttl > MAX_OVERRIDE_TTL_MINUTES)
    throw new Error(
      `--ttl-minutes must be between 1 and ${MAX_OVERRIDE_TTL_MINUTES}.`
    );
  const now = input.now ?? new Date();
  const override: GuardOverride = {
    id: randomBytes(8).toString('hex'),
    kind: input.kind,
    repo: input.repo.toLowerCase(),
    ref: input.ref?.trim() || '*',
    reason,
    approvedBy,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttl * 60_000).toISOString(),
    machine: input.machine,
  };
  const paths = guardPaths(home);
  await mkdir(paths.overrides, { recursive: true, mode: 0o700 });
  await writeFile(
    join(paths.overrides, `${override.id}.json`),
    `${JSON.stringify(override, null, 2)}\n`,
    { mode: 0o600, flag: 'wx' }
  );
  await appendGuardLog(
    {
      event: 'override-created',
      kind: override.kind,
      machine: override.machine,
      repo: override.repo,
      ref: override.ref,
      reason,
      approvedBy,
      overrideId: override.id,
    },
    home
  );
  return override;
}

export async function listOverrides(home = gitGuardHome()) {
  const dir = guardPaths(home).overrides;
  const names = await readdir(dir).catch(() => [] as string[]);
  const overrides: GuardOverride[] = [];
  for (const name of names.filter((file) => file.endsWith('.json'))) {
    try {
      overrides.push(
        JSON.parse(await readFile(join(dir, name), 'utf8')) as GuardOverride
      );
    } catch {
      // Ignore unreadable tokens; they can never match.
    }
  }
  return overrides;
}

/**
 * Atomically claim one matching, unexpired override. The rename into
 * `consumed/` is the single-use fence: of two racing pushes only one rename
 * succeeds. The consumption is logged before the caller proceeds.
 */
export async function consumeOverride(
  match: { kind: GuardKind; repo: string; ref: string },
  context: { machine: string; cwd?: string; now?: Date },
  home = gitGuardHome()
) {
  const now = (context.now ?? new Date()).getTime();
  const paths = guardPaths(home);
  const candidates = (await listOverrides(home))
    .filter(
      (override) =>
        override.kind === match.kind &&
        override.repo === match.repo.toLowerCase() &&
        (override.ref === match.ref ||
          (match.kind === 'pr' && override.ref === '*')) &&
        Date.parse(override.expiresAt) > now
    )
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  await mkdir(paths.consumed, { recursive: true, mode: 0o700 });
  for (const override of candidates) {
    try {
      await rename(
        join(paths.overrides, `${override.id}.json`),
        join(paths.consumed, `${override.id}.json`)
      );
    } catch {
      continue;
    }
    await appendGuardLog(
      {
        event: 'override-consumed',
        kind: match.kind,
        machine: context.machine,
        repo: match.repo,
        ref: match.ref,
        reason: override.reason,
        approvedBy: override.approvedBy,
        overrideId: override.id,
        cwd: context.cwd,
      },
      home
    );
    return override;
  }
  return null;
}
