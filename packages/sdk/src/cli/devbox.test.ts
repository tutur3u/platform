import { describe, expect, it } from 'vitest';
import {
  collectRepeatedFlagValues,
  createDevboxRunPayload,
  extractDevboxForwardedCommand,
  parseDurationSeconds,
} from './devbox';

describe('devbox CLI helpers', () => {
  it('extracts commands after -- without treating command flags as CLI flags', () => {
    expect(
      extractDevboxForwardedCommand([
        'box',
        'run',
        '--keep',
        '--',
        'bun',
        '--cwd',
        'packages/sdk',
        'test',
      ])
    ).toEqual(['bun', '--cwd', 'packages/sdk', 'test']);
  });

  it('falls back to positional command syntax for compact use', () => {
    expect(
      extractDevboxForwardedCommand(['box', 'run', 'bun', 'check'])
    ).toEqual(['bun', 'check']);
  });

  it('collects repeated --env values from raw argv', () => {
    expect(
      collectRepeatedFlagValues(
        ['box', 'run', '--env', 'A=1', '--env=B=2', '--', 'bun', 'check'],
        'env'
      )
    ).toEqual(['A=1', 'B=2']);
  });

  it.each([
    ['90', 90],
    ['2m', 120],
    ['1h', 3600],
  ])('parses duration %s', (input, expected) => {
    expect(parseDurationSeconds(input)).toBe(expected);
  });

  it('creates an auto-lease run payload for remote Bun commands', () => {
    expect(
      createDevboxRunPayload({
        argv: [
          'box',
          'run',
          '--keep',
          '--reuse',
          '--timeout',
          '2m',
          '--preview-port',
          '7803',
          '--env',
          'DATABASE_URL=postgres://remote',
          '--env-file',
          '.env.remote',
          '--',
          'bun',
          'sb:reset',
        ],
        flags: {
          keep: true,
          reuse: true,
          timeout: '2m',
          'preview-port': '7803',
          'env-file': '.env.remote',
        },
      })
    ).toEqual({
      command: ['bun', 'sb:reset'],
      env: {
        DATABASE_URL: 'postgres://remote',
      },
      envFiles: ['.env.remote'],
      keep: true,
      leaseMode: 'auto',
      previewPorts: [7803],
      reuse: true,
      timeoutSeconds: 120,
    });
  });
});
