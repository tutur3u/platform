import type { FenceSnapshot } from '@tuturuuu/session/control';
import { describe, expect, it, vi } from 'vite-plus/test';
import { createFenceReader, FENCE_READ_INTERVAL_MS } from './fence-reader';

function setup(floor: string | undefined = '') {
  let now = 1_000_000;
  let next: FenceSnapshot | Error = {
    mode: 'running',
    version: 1,
    readAtMs: now,
  };
  const read = vi.fn(async () => {
    if (next instanceof Error) throw next;
    return { ...next, readAtMs: now };
  });
  const reader = createFenceReader({
    read,
    now: () => now,
    floor,
    onReadError: () => {},
  });
  return {
    reader,
    read,
    advance: (ms: number) => {
      now += ms;
    },
    setNext: (value: FenceSnapshot | Error) => {
      next = value;
    },
  };
}

describe('isolate fence reader', () => {
  it('reads SessionControl at most once per 10 seconds, sharing one read', async () => {
    const { reader, read, advance } = setup();
    await Promise.all([
      reader.snapshot(),
      reader.snapshot(),
      reader.snapshot(),
    ]);
    expect(read).toHaveBeenCalledTimes(1);
    advance(FENCE_READ_INTERVAL_MS - 1);
    await reader.snapshot();
    expect(read).toHaveBeenCalledTimes(1);
    advance(1);
    await reader.snapshot();
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('allows issuance only with a fresh running snapshot', async () => {
    const { reader } = setup();
    expect(await reader.decide({ kind: 'session_issue' })).toMatchObject({
      allowed: true,
    });
  });

  it('fails issuance closed when SessionControl is unreachable', async () => {
    const { reader, read, setNext, advance } = setup();
    await reader.snapshot();
    setNext(new Error('down'));
    advance(FENCE_READ_INTERVAL_MS + 1);
    expect(await reader.decide({ kind: 'session_issue' })).toMatchObject({
      allowed: false,
      reason: 'stale',
    });
    // Resolution keeps working on the last snapshot inside the 5-minute fuse.
    expect(await reader.decide({ kind: 'resolve' })).toMatchObject({
      allowed: true,
    });
    // The failed read also waits out the interval.
    await reader.snapshot();
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('refuses issuance with no snapshot at all', async () => {
    const { reader, setNext } = setup();
    setNext(new Error('down'));
    expect(await reader.decide({ kind: 'credential_mint' })).toMatchObject({
      allowed: false,
    });
    expect(await reader.decide({ kind: 'resolve' })).toMatchObject({
      allowed: false,
      reason: 'unavailable',
    });
  });

  it('applies the deployed floor over a running fence', async () => {
    const { reader } = setup('issuance_stopped');
    expect(await reader.decide({ kind: 'session_issue' })).toMatchObject({
      allowed: false,
      reason: 'forbidden',
    });
    expect(await reader.decide({ kind: 'security_cleanup' })).toMatchObject({
      allowed: true,
    });
  });

  it('reads a mistyped floor as stopped', async () => {
    const { reader } = setup('stoped');
    expect(await reader.decide({ kind: 'resolve' })).toMatchObject({
      allowed: false,
    });
  });
});
