import { describe, expect, it } from 'vitest';
import {
  capabilityPressure,
  diskCapability,
  freeGiBBucket,
  GiB,
  parseByteSize,
  parseDiskCapability,
  percentBucket,
  probeVolume,
  storagePressure,
  storageThresholds,
} from './storage-headroom';

const probe = (
  freeGiB: number,
  totalGiB = 500,
  inodeFreePercent: number | null = 90
) => ({
  freeBytes: freeGiB * GiB,
  freePercent: (freeGiB / totalGiB) * 100,
  inodeFreePercent,
});

describe('storage pressure', () => {
  it('is critical below 15 GiB, below 5% free or below 5% inodes', () => {
    expect(storagePressure(probe(14)).pressure).toBe('critical');
    // 20 GiB of 500 GiB is 4% free.
    expect(storagePressure(probe(20)).pressure).toBe('critical');
    expect(storagePressure(probe(200, 500, 4)).pressure).toBe('critical');
  });

  it('is low within twice a threshold and ok above', () => {
    expect(storagePressure(probe(40)).pressure).toBe('low');
    expect(storagePressure(probe(100)).pressure).toBe('ok');
    // Unknown inode tables (btrfs) never trip the inode threshold.
    expect(storagePressure(probe(100, 500, null)).pressure).toBe('ok');
  });

  it('reads thresholds from the environment and ignores invalid values', () => {
    const { thresholds, warnings } = storageThresholds({
      TTR_STORAGE_MIN_FREE: '30G',
      TTR_STORAGE_MIN_FREE_PERCENT: 'lots',
    });
    expect(thresholds.minFreeBytes).toBe(30 * GiB);
    expect(thresholds.minFreePercent).toBe(5);
    expect(warnings).toHaveLength(1);
  });

  it('parses sizes', () => {
    expect(parseByteSize('15G')).toBe(15 * GiB);
    expect(parseByteSize('512MiB')).toBe(512 * 1024 ** 2);
    expect(() => parseByteSize('-1G')).toThrow();
  });
});

describe('heartbeat disk capability', () => {
  it('buckets free space as conservative lower bounds', () => {
    expect(freeGiBBucket(14.9 * GiB)).toBe(10);
    expect(freeGiBBucket(16 * GiB)).toBe(15);
    expect(freeGiBBucket(0)).toBe(0);
    expect(percentBucket(9.9)).toBe(5);
    expect(percentBucket(250)).toBe(100);
  });

  it('builds a payload of a few bytes', async () => {
    const volume = await probeVolume(
      '/',
      async () => ({
        bsize: 4096,
        blocks: 131_072_000,
        bavail: 13_107_200,
        files: 0,
        ffree: 0,
      }),
      async () => ({ dev: 1 })
    );
    expect(volume.inodeFreePercent).toBeNull();
    const capability = diskCapability(volume);
    expect(capability).toEqual({ freeGiB: 50, freePct: 10 });
    expect(JSON.stringify({ disk: capability }).length).toBeLessThan(40);
    expect(capabilityPressure(capability).pressure).toBe('ok');
    expect(capabilityPressure({ freeGiB: 10, freePct: 50 }).pressure).toBe(
      'critical'
    );
  });

  it('throws on an unusable statfs reading so admission sees UNKNOWN', async () => {
    const stat = async () => ({ dev: 1 });
    for (const reading of [
      { bsize: 4096, blocks: 0, bavail: 0, files: 0, ffree: 0 },
      { bsize: 4096, blocks: Number.NaN, bavail: 1, files: 0, ffree: 0 },
      { bsize: 0, blocks: 100, bavail: 10, files: 0, ffree: 0 },
      { bsize: 4096, blocks: 100, bavail: 200, files: 0, ffree: 0 },
      { bsize: 4096, blocks: 100, bavail: -1, files: 0, ffree: 0 },
      { bsize: 4096, blocks: 100, bavail: 10, files: 10, ffree: 20 },
      {
        bsize: 4096,
        blocks: Number.POSITIVE_INFINITY,
        bavail: 1,
        files: 0,
        ffree: 0,
      },
    ])
      await expect(probeVolume('/', async () => reading, stat)).rejects.toThrow(
        /unusable volume reading/u
      );
  });

  it('accepts only integer GiB, 5% buckets and known keys', () => {
    expect(
      parseDiskCapability({ freeGiB: 50, freePct: 10, inodeFreePct: 95 })
    ).toEqual({ freeGiB: 50, freePct: 10, inodeFreePct: 95 });
    for (const value of [
      { freeGiB: '50', freePct: 10 },
      { freeGiB: [50], freePct: 10 },
      { freeGiB: 1.5, freePct: 10 },
      { freeGiB: -1, freePct: 10 },
      { freeGiB: 50, freePct: 12 },
      { freeGiB: 50, freePct: 10, extra: true },
      { freeGiB: 50, freePct: 10, inodeFreePct: '95' },
      [50, 10],
      null,
    ])
      expect(parseDiskCapability(value)).toBeNull();
  });
});
