import { describe, expect, it } from 'vitest';
import { resolveHiveRealtimeUrl } from './config';

describe('resolveHiveRealtimeUrl', () => {
  it('uses configured realtime URLs verbatim', () => {
    expect(
      resolveHiveRealtimeUrl({
        NEXT_PUBLIC_HIVE_REALTIME_URL: 'wss://custom.example/realtime',
      } as NodeJS.ProcessEnv)
    ).toBe('wss://custom.example/realtime');
  });

  it('falls back to the Portless realtime endpoint path', () => {
    expect(resolveHiveRealtimeUrl({} as NodeJS.ProcessEnv)).toMatch(
      /^wss?:\/\/.+\/realtime$/u
    );
  });
});
