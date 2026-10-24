import { describe, expect, it } from 'vitest';
import {
  decodeWorkloadEnvironment,
  encodeWorkloadEnvironment,
  relayEnvironment,
  resourceEnvironmentLimit,
} from './resources-launcher-environment';

const nonce = 'a'.repeat(64);

describe('resource relay environment boundary', () => {
  it('keeps interpreter preloads and task credentials out of the relay', () => {
    const env = {
      HOME: '/private/test-home',
      PATH: '/usr/bin:/bin',
      NODE_OPTIONS: '--require=/untrusted/preload.cjs',
      BUN_OPTIONS: '--preload=/untrusted/preload.ts',
      DYLD_INSERT_LIBRARIES: '/untrusted/library',
      TASK_SECRET: 'fixture-only',
      TTR_RESOURCES_ADMITTED: 'fixture-lane',
    };
    expect(relayEnvironment(env)).toEqual({
      HOME: env.HOME,
      PATH: env.PATH,
    });
    expect(
      decodeWorkloadEnvironment(encodeWorkloadEnvironment(nonce, env), nonce)
    ).toEqual(env);
  });

  it('rejects a transfer from another launch', () => {
    expect(() =>
      decodeWorkloadEnvironment(
        encodeWorkloadEnvironment(nonce, { PATH: '/bin' }),
        'b'.repeat(64)
      )
    ).toThrow('nonce mismatch');
  });

  it('bounds transfer size before forking and while decoding', () => {
    expect(() =>
      encodeWorkloadEnvironment(nonce, {
        LARGE: 'x'.repeat(resourceEnvironmentLimit),
      })
    ).toThrow('2 MiB');
    expect(() =>
      decodeWorkloadEnvironment(
        Buffer.alloc(resourceEnvironmentLimit + 1),
        nonce
      )
    ).toThrow('limit exceeded');
  });

  it('rejects invalid environment keys and values at the pipe boundary', () => {
    for (const env of [{ 'BAD=KEY': 'x' }, { GOOD: 'bad\0value' }]) {
      expect(() =>
        decodeWorkloadEnvironment(
          Buffer.from(JSON.stringify({ nonce, env })),
          nonce
        )
      ).toThrow();
    }
  });
});
