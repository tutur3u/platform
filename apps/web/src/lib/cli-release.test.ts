import { describe, expect, it } from 'vitest';
import { CLI_INSTALL_COMMANDS, parseCliRelease } from './cli-release';

describe('ttr CLI release', () => {
  it('reads the stable version of the tuturuuu package', () => {
    expect(parseCliRelease({ name: 'tuturuuu', version: '0.29.0' })).toBe(
      '0.29.0'
    );
  });

  it.each([
    null,
    'tuturuuu',
    [],
    { name: 'other', version: '1.0.0' },
    { name: 'tuturuuu', version: '0.30.0-beta.1' },
    { name: 'tuturuuu', version: '<script>' },
    { name: 'tuturuuu' },
  ])('rejects %j', (value) => {
    expect(parseCliRelease(value)).toBeNull();
  });

  it('installs the package that ships the ttr binary', () => {
    expect(CLI_INSTALL_COMMANDS).toEqual({
      bun: 'bun add -g tuturuuu',
      npm: 'npm install -g tuturuuu',
    });
  });
});
