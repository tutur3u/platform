import { describe, expect, it } from 'vitest';
import { isHeavyCommand, limitCommand } from './resources-command';
import { defaultResourceConfig } from './resources-config';

describe('aggregate validation resource admission', () => {
  it('queues the renamed aggregate and its force-now alias', () => {
    for (const command of [
      ['validate'],
      ['run', 'validate'],
      ['validate:now'],
      ['run', 'validate:now'],
      ['--cwd', 'apps/web', 'run', 'validate'],
    ]) {
      expect(isHeavyCommand('bun', command)).toBe(true);
    }
    expect(isHeavyCommand('turbo', ['run', 'validate'])).toBe(true);
  });

  it('admits native checks and leaves rejected aggregate flags lightweight', () => {
    expect(
      isHeavyCommand('bun', ['check', '--no-script', '--threads', '6'])
    ).toBe(true);
    expect(isHeavyCommand('bun', ['validate', '--dry-run'])).toBe(false);
    expect(isHeavyCommand('bun', ['validate', '--help'])).toBe(false);
  });
});

describe('native Bun checker thread budget', () => {
  const config = { ...defaultResourceConfig(), buildJobs: 3 };

  it.each([
    [['check'], ['check', '--threads=3']],
    [
      ['check', '--no-script', '-p', 'tsconfig.json'],
      ['check', '--no-script', '-p', 'tsconfig.json', '--threads=3'],
    ],
    [
      ['--cwd', 'apps/web', 'check', '--no-script'],
      ['--cwd', 'apps/web', 'check', '--no-script', '--threads=3'],
    ],
    [
      ['check', '--', '--threads=20'],
      ['check', '--threads=3', '--', '--threads=20'],
    ],
  ])('injects the lane budget for %j', (args, expected) => {
    expect(limitCommand('bun', args, config)).toEqual(expected);
  });

  it.each([
    ['check', '--threads', '2', '-p', 'tsconfig.json'],
    ['check', '--threads=2'],
    ['check', '--help'],
    ['validate'],
    ['run', 'validate:now'],
    ['check:changed'],
  ])('preserves explicit budgets and other commands: %j', (...args) => {
    expect(limitCommand('bun', args, config)).toEqual(args);
  });
});
