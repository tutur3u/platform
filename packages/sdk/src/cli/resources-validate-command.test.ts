import { describe, expect, it } from 'vitest';
import { isHeavyCommand } from './resources-command';

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

  it('retains native check admission and lightweight dry-run behavior', () => {
    expect(
      isHeavyCommand('bun', ['check', '--no-script', '--threads', '6'])
    ).toBe(true);
    expect(isHeavyCommand('bun', ['validate', '--dry-run'])).toBe(false);
    expect(isHeavyCommand('bun', ['validate', '--help'])).toBe(false);
  });
});
