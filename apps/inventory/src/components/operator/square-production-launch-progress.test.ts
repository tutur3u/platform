import { describe, expect, it } from 'vitest';
import { getSquareProductionLaunchProgress } from './square-production-launch-progress';

describe('getSquareProductionLaunchProgress', () => {
  it('keeps pairing and live verification blocked until the connection is ready', () => {
    expect(
      getSquareProductionLaunchProgress({
        connectionReady: false,
        deviceReady: false,
      })
    ).toEqual([
      { id: 'hardware', status: 'manual' },
      { id: 'connect', status: 'needsAction' },
      { id: 'pair', status: 'blocked' },
      { id: 'verify', status: 'blocked' },
    ]);
  });

  it('unlocks a controlled live verification only after pairing', () => {
    expect(
      getSquareProductionLaunchProgress({
        connectionReady: true,
        deviceReady: true,
      })
    ).toEqual([
      { id: 'hardware', status: 'manual' },
      { id: 'connect', status: 'complete' },
      { id: 'pair', status: 'complete' },
      { id: 'verify', status: 'ready' },
    ]);
  });
});
