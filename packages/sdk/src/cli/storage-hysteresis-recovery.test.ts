import { describe, expect, it } from 'vitest';
import { GiB } from './storage-headroom';
import {
  belowRecover,
  hysteresisThresholds,
  nextVolumeState,
} from './storage-hysteresis';
import { blockerReport } from './storage-reclaim-report';

const volume = (free: number) => ({
  freeBytes: free * GiB,
  freePercent: free / 80,
  inodeFreePercent: 50,
});
describe('bounded percentage recovery on large volumes', () => {
  it('recovers an 8 TiB-class volume at 537 GiB instead of demanding 800 GiB', () => {
    const thresholds = hysteresisThresholds({});
    expect(nextVolumeState('ok', volume(300), thresholds).state).toBe('low');
    expect(nextVolumeState('low', volume(499), thresholds).state).toBe('low');
    expect(nextVolumeState('low', volume(537), thresholds).state).toBe('ok');
    expect(belowRecover(volume(537), thresholds.recover)).toBe(false);
  });
  it('honors an explicit lower percentage recovery threshold above a small band', () => {
    const thresholds = hysteresisThresholds({
      TTR_STORAGE_RECOVER_FREE_PERCENT: '5',
    });
    expect(nextVolumeState('low', volume(400), thresholds).state).toBe('low');
    expect(nextVolumeState('low', volume(410), thresholds).state).toBe('ok');
  });
  it('honors an explicit byte threshold but keeps one GiB above low', () => {
    const thresholds = hysteresisThresholds({
      TTR_STORAGE_MIN_FREE: '40G',
      TTR_STORAGE_RECOVER_FREE: '20G',
      TTR_STORAGE_MIN_FREE_PERCENT: '0',
    });
    expect(thresholds.recover.minFreeBytes).toBe(41 * GiB);
  });
});

it('reports the capped percentage in the resume condition', () => {
  const sample = {
    ...volume(450),
    path: '/job',
    device: 1,
    totalBytes: 8000 * GiB,
    usedBytes: 7550 * GiB,
    inodesTotal: null,
    inodesFree: null,
  };
  const message = blockerReport({
    host: 'fixture',
    cwd: '/job',
    volume: sample,
    recover: hysteresisThresholds({}).recover,
    reasons: [],
    result: null,
    suggestions: [],
    holds: [],
  });
  expect(message).toContain('6.25% free');
  expect(message).not.toContain('10% free');
});
