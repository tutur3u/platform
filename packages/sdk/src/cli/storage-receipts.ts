import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

// Private, append-only manifest of every automatic removal, kept per storage
// authority (one OS user's storage home on one host). An `intent` line is
// written and fsynced before acting and an `outcome` line after, so an
// interrupted run still shows what it was about to touch. If the intent
// cannot be durably written (append, fsync or directory sync fails) the item
// is skipped: nothing is removed without a durable pre-receipt.

export interface ReceiptContext {
  host: string;
  orchestrator: string | null;
  trigger: string;
  leaseToken: string;
  /** Lease fencing number the removal ran under. */
  fence: number;
  pid: number;
}

export interface ReceiptItem {
  path: string;
  rule: string;
  owner: string;
  /** Measured before acting. */
  bytes: number;
  /** Checks that passed right before acting, in order. */
  checks: string[];
  /** Process-visibility evidence the removal relied on. */
  evidence: 'full-visibility' | 'private-tree';
}

export type ReceiptLine = ReceiptContext &
  ReceiptItem & {
    phase: 'intent' | 'outcome';
    at: string;
    status?: 'done' | 'failed' | 'not-run';
    /** Bytes the action released. */
    freedBytes?: number;
    error?: string;
  };

export const receiptsDir = (home: string, host: string) =>
  join(home, 'reclaim', host, 'receipts');

/** File operations a manifest uses (injectable to test failures). */
export interface ReceiptFs {
  open: (path: string, flags: string, mode?: number) => number;
  write: (fd: number, text: string) => void;
  fsync: (fd: number) => void;
  close: (fd: number) => void;
}

export const realReceiptFs: ReceiptFs = {
  open: (path, flags, mode) => openSync(path, flags, mode),
  write: (fd, text) => {
    writeSync(fd, text);
  },
  fsync: (fd) => fsyncSync(fd),
  close: (fd) => closeSync(fd),
};

export interface Manifest {
  file: string;
  /** Durably records the intent; throws when it could not. */
  intent: (item: ReceiptItem) => void;
  outcome: (
    item: ReceiptItem,
    result: {
      status: 'done' | 'failed' | 'not-run';
      freedBytes: number;
      error?: string;
    }
  ) => void;
}

/** Creates missing directories, fsyncing each new one and its parent. */
function mkdirDurable(dir: string, fs: ReceiptFs) {
  if (existsSync(dir)) return;
  mkdirDurable(dirname(dir), fs);
  mkdirSync(dir, { mode: 0o700 });
  for (const path of [dir, dirname(dir)]) {
    const fd = fs.open(path, 'r');
    try {
      fs.fsync(fd);
    } finally {
      fs.close(fd);
    }
  }
}

export function openManifest(
  home: string,
  context: ReceiptContext,
  now: () => number = Date.now,
  fs: ReceiptFs = realReceiptFs
): Manifest {
  const dir = receiptsDir(home, context.host);
  mkdirDurable(dir, fs);
  const stamp = new Date(now()).toISOString().replace(/[:.]/gu, '-');
  const file = join(dir, `${stamp}-${context.leaseToken.slice(0, 8)}.jsonl`);
  let created = false;
  const write = (line: ReceiptLine) => {
    const fd = fs.open(file, 'a', 0o600);
    try {
      fs.write(fd, `${JSON.stringify(line)}\n`);
      fs.fsync(fd);
    } finally {
      fs.close(fd);
    }
    if (!created) {
      // The new file's directory entry must be durable too.
      const dirFd = fs.open(dir, 'r');
      try {
        fs.fsync(dirFd);
      } finally {
        fs.close(dirFd);
      }
      created = true;
    }
  };
  return {
    file,
    intent: (item) =>
      write({
        ...context,
        ...item,
        phase: 'intent',
        at: new Date(now()).toISOString(),
      }),
    outcome: (item, result) =>
      write({
        ...context,
        ...item,
        phase: 'outcome',
        at: new Date(now()).toISOString(),
        ...result,
      }),
  };
}

export function readReceipts(home: string, host: string): ReceiptLine[] {
  const dir = receiptsDir(home, host);
  let names: string[];
  try {
    names = readdirSync(dir)
      .filter((name) => name.endsWith('.jsonl'))
      .sort();
  } catch {
    return [];
  }
  return names.flatMap((name) =>
    readFileSync(join(dir, name), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as ReceiptLine)
  );
}

/** Summary of the last automatic run, read to debounce and to report. */
export interface LastReclaim {
  at: string;
  trigger: string;
  orchestrator: string | null;
  status: string;
  freedBytes: number;
  report: string | null;
}

const lastFile = (home: string, host: string) =>
  join(home, 'reclaim', host, 'last.json');

export function readLastReclaim(home: string, host: string) {
  try {
    const data = JSON.parse(
      readFileSync(lastFile(home, host), 'utf8')
    ) as LastReclaim;
    return typeof data.at === 'string' ? data : null;
  } catch {
    return null;
  }
}

export function writeLastReclaim(
  home: string,
  host: string,
  last: LastReclaim
) {
  const file = lastFile(home, host);
  try {
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    const temp = `${file}.${process.pid}.tmp`;
    writeFileSync(temp, `${JSON.stringify(last, null, 2)}\n`, { mode: 0o600 });
    renameSync(temp, file);
  } catch {
    // Debounce state only; a failed write means the next trigger re-plans.
  }
}
