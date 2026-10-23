import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, rename, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { failureClass, receiptReset, safeReceipt } from './failure-receipt';
import { HookError } from './hook-ledger';
import {
  acquireTransactionLock,
  releaseTransactionLock,
} from './transaction-lock';
export interface QuotaBlock {
  pool: string;
  modelScope: string;
  reason: string;
  observedAt: string;
  resetAt?: string | null;
  nextEligibleAt?: string | null;
  evidence?: string[];
  id?: string;
  [key: string]: unknown;
}
export interface BlockLedger {
  version: 1;
  blocks: QuotaBlock[];
  [key: string]: unknown;
}
export const blockLedgerPath = () =>
  join(homedir(), '.local/share/tuturuuu/orchestration/quota/blocks.json');
export function validGlob(value: unknown): value is string {
  return (
    typeof value === 'string' && /^[A-Za-z0-9_./:*?%-]{1,256}$/.test(value)
  );
}
export function matchesScope(glob: string, model: string) {
  const pattern = glob
    .split('')
    .map((char) =>
      char === '*'
        ? '.*'
        : char === '?'
          ? '.'
          : char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    )
    .join('');
  return new RegExp(`^${pattern}$`, 'i').test(model);
}
export function blockUntil(block: QuotaBlock): number {
  if (block.resetAt == null && block.nextEligibleAt == null)
    return Number.POSITIVE_INFINITY;
  return Math.max(
    ...[block.resetAt, block.nextEligibleAt]
      .filter((x): x is string => typeof x === 'string')
      .map(Date.parse)
  );
}
export function matchingBlocks(
  blocks: QuotaBlock[],
  pools: string[],
  model: string | undefined,
  now: Date
) {
  return blocks.filter(
    (block) =>
      pools.includes(block.pool) &&
      blockUntil(block) > now.getTime() &&
      (model === undefined || matchesScope(block.modelScope, model))
  );
}
export async function readBlockLedger(
  path = blockLedgerPath()
): Promise<BlockLedger> {
  try {
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.size > 2_000_000)
        throw new HookError('block-ledger-invalid');
      const data = JSON.parse(await file.readFile('utf8'));
      if (data.version !== 1 || !Array.isArray(data.blocks))
        throw new HookError('block-ledger-invalid');
      for (const b of data.blocks) {
        if (
          !b ||
          typeof b.pool !== 'string' ||
          !/^[A-Za-z0-9_-]{1,128}$/.test(b.pool) ||
          !validGlob(b.modelScope) ||
          typeof b.reason !== 'string' ||
          typeof b.observedAt !== 'string' ||
          !Number.isFinite(Date.parse(b.observedAt)) ||
          Number.isNaN(blockUntil(b)) ||
          [b.resetAt, b.nextEligibleAt].some(
            (x) =>
              x != null &&
              (typeof x !== 'string' || !Number.isFinite(Date.parse(x)))
          )
        )
          throw new HookError('block-ledger-invalid');
      }
      return data;
    } finally {
      await file.close();
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      return { version: 1, blocks: [] };
    throw new HookError('block-ledger-unreadable');
  }
}
export function createBlock(input: {
  pool: string;
  modelScope: string;
  reason: string;
  evidence: string;
  observedAt: string;
  resetAt?: string;
  nextEligibleAt?: string;
  timezone?: string;
}): QuotaBlock {
  if (
    !/^[A-Za-z0-9_-]{1,128}$/.test(input.pool) ||
    !validGlob(input.modelScope) ||
    !input.reason.trim() ||
    !input.evidence.trim() ||
    input.reason.length > 4096 ||
    input.evidence.length > 4096 ||
    !Number.isFinite(Date.parse(input.observedAt))
  )
    throw new HookError('block-input-invalid');
  const reason = safeReceipt(input.reason, failureClass(input.reason)).text;
  const evidence = [
    safeReceipt(input.evidence, failureClass(input.evidence)).text,
  ];
  const resetAt =
    input.resetAt ??
    receiptReset(
      `${reason}\n${evidence.join('\n')}`,
      input.observedAt,
      input.timezone
    ) ??
    undefined;
  const nextEligibleAt =
    input.nextEligibleAt ??
    (resetAt
      ? undefined
      : new Date(Date.parse(input.observedAt) + 5 * 3600_000).toISOString());
  const block: QuotaBlock = {
    pool: input.pool,
    modelScope: input.modelScope,
    reason,
    observedAt: input.observedAt,
    resetAt,
    nextEligibleAt,
    evidence,
  };
  if (
    [resetAt, nextEligibleAt].some(
      (x) =>
        x !== undefined &&
        (!Number.isFinite(Date.parse(x)) ||
          Date.parse(x) <= Date.parse(input.observedAt))
    )
  )
    throw new HookError('block-expiry-invalid');
  block.id = blockId(block);
  return block;
}
function blockId(block: QuotaBlock) {
  return createHash('sha256')
    .update(
      JSON.stringify([
        block.pool,
        block.modelScope,
        block.reason,
        block.evidence ?? [],
      ])
    )
    .digest('hex');
}
export async function updateBlockLedger<T>(
  operation: (ledger: BlockLedger) => T,
  path = blockLedgerPath()
) {
  const directory = dirname(path);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  if (!(await lstat(directory)).isDirectory())
    throw new HookError('block-directory-invalid');
  const lockPath = join(directory, 'blocks.lock');
  const lock = await acquireTransactionLock(lockPath);
  const temporary = join(directory, `blocks-${randomUUID()}.tmp`);
  try {
    const ledger = await readBlockLedger(path);
    const result = operation(ledger);
    const content = `${JSON.stringify(ledger, null, 2)}\n`;
    if (Buffer.byteLength(content) > 2_000_000)
      throw new HookError('block-ledger-full');
    const file = await open(
      temporary,
      constants.O_CREAT |
        constants.O_EXCL |
        constants.O_WRONLY |
        constants.O_NOFOLLOW,
      0o600
    );
    try {
      await file.writeFile(content);
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temporary, path);
    const dir = await open(directory, constants.O_RDONLY);
    try {
      await dir.sync();
    } finally {
      await dir.close();
    }
    return result;
  } finally {
    await unlink(temporary).catch(() => {});
    await releaseTransactionLock(lockPath, lock);
  }
}

export async function writeBlock(block: QuotaBlock, path = blockLedgerPath()) {
  return updateBlockLedger((ledger) => {
    const previous = ledger.blocks.find(
      (item) => (item.id ?? blockId(item)) === block.id
    );
    if (previous)
      return {
        status: 'recorded',
        replay: true,
        pool: previous.pool,
        modelScope: previous.modelScope,
        eligibleAt: Number.isFinite(blockUntil(previous))
          ? new Date(blockUntil(previous)).toISOString()
          : null,
      };
    ledger.blocks.push(block);
    return {
      status: 'recorded',
      replay: false,
      pool: block.pool,
      modelScope: block.modelScope,
      eligibleAt: new Date(blockUntil(block)).toISOString(),
    };
  }, path);
}
