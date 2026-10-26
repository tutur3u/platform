import { describe, expect, it } from 'vitest';
import {
  collectRepeatedFlagValues,
  extractDevboxForwardedCommand,
  parseDurationSeconds,
} from './devbox';

describe('devbox CLI argument parsing', () => {
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
      extractDevboxForwardedCommand(['box', 'run', 'bun', 'validate'])
    ).toEqual(['bun', 'validate']);
  });

  it('collects repeated --env values from raw argv', () => {
    expect(
      collectRepeatedFlagValues(
        ['box', 'run', '--env', 'A=1', '--env=B=2', '--', 'bun', 'validate'],
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
});
