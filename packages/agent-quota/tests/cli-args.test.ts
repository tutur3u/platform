import { describe, expect, it } from 'vitest';
import { argumentValue } from '../src/cli-args';

describe('CLI value arguments', () => {
  it.each(['--provider', '--model'])(
    'rejects a missing value for %s',
    (flag) => {
      expect(() =>
        argumentValue(flag, ['agent-quota', 'recommend', flag])
      ).toThrow(`${flag} requires a value.`);
      expect(() =>
        argumentValue(flag, ['agent-quota', 'recommend', flag, '--json'])
      ).toThrow(`${flag} requires a value.`);
    }
  );

  it('keeps absent flags optional and accepts supplied values', () => {
    expect(
      argumentValue('--provider', ['agent-quota', 'recommend'])
    ).toBeUndefined();
    expect(
      argumentValue('--provider', [
        'agent-quota',
        'recommend',
        '--provider',
        'claude',
      ])
    ).toBe('claude');
  });
});
