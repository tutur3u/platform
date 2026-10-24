import { describe, expect, it } from 'vitest';
import { commandTool, isHeavyCommand, limitCommand } from './resources-command';
import { defaultResourceConfig } from './resources-config';

const program = 'node_modules/vitest/vitest.mjs';
describe('Node runtime option admission', () => {
  it.each([
    '--diagnostic-dir',
    '--cpu-prof-dir',
    '--heap-prof-name',
    '--inspect-port',
    '--env-file-if-exists',
    '--experimental-default-type',
    '--report-directory',
    '--test-reporter-destination',
    '--max-old-space-size',
  ])('recognizes Vitest after %s with a separate or attached value', (flag) => {
    for (const prefix of [[flag, '/tmp'], [`${flag}=/tmp`]]) {
      const args = [...prefix, program, 'run', '--maxWorkers=24'];
      expect(commandTool('node', args).tool).toBe('vitest');
      expect(isHeavyCommand('node', args)).toBe(true);
      expect(limitCommand('node', args, defaultResourceConfig())).toEqual([
        ...prefix,
        program,
        'run',
        `--maxWorkers=${defaultResourceConfig().vitestWorkers}`,
      ]);
    }
  });
  it.each([
    ['--future-option', '/tmp', program, 'run'],
    ['--future-option=/tmp', program, 'run'],
    ['--future-option', '--help'],
    ['--diagnostic-dir'],
    ['--diagnostic-dir', '--version'],
    ['--run=build'],
    ['--run', 'build'],
  ])('admits ambiguous or script-running runtime arguments %j', (...args) => {
    expect(isHeavyCommand('node', args)).toBe(true);
  });
  it.each(['--experimental-specifier-resolution'])(
    'admits the bare %s form instead of consuming a possible program',
    (flag) => {
      const args = [flag, program, 'run', '--maxWorkers=24'];
      expect(commandTool('node', args).tool).toBe('ambiguous');
      expect(isHeavyCommand('node', args)).toBe(true);
      const attached = [`${flag}=fixture`, program, 'run', '--maxWorkers=24'];
      expect(commandTool('node', attached).tool).toBe('vitest');
      expect(limitCommand('node', attached, defaultResourceConfig())).toContain(
        `--maxWorkers=${defaultResourceConfig().vitestWorkers}`
      );
    }
  );
  it.each([
    ['node', '--diagnostic-dir', program],
    ['node', '--require', 'vitest'],
    ['node', '--title', 'resources-entry.js'],
    ['node', '--title', 'ttr.cjs'],
    ['node', '--cpu-prof-dir', 'scripts/check.js'],
    ['node', '--env-file', 'run-script-tests.js'],
    ['bun', '--preload', 'playwright'],
    ['npx', '--package', 'vitest'],
  ])(
    'admits a potentially executable value in %s %s %s',
    (name, flag, value) => {
      const args = [flag, value, 'ordinary.js'];
      expect(commandTool(name, args).tool).toBe('ambiguous');
      expect(isHeavyCommand(name, args)).toBe(true);
    }
  );
  it('preserves runtime separators while capping the selected program', () => {
    expect(
      limitCommand(
        'node',
        ['--no-warnings', '--', program, 'run', '--maxWorkers=24'],
        defaultResourceConfig()
      )
    ).toEqual([
      '--no-warnings',
      '--',
      program,
      'run',
      `--maxWorkers=${defaultResourceConfig().vitestWorkers}`,
    ]);
  });
  it('never scans a known program argument as another entrypoint', () => {
    expect(
      isHeavyCommand('node', [
        '--diagnostic-dir',
        '/tmp',
        'app.js',
        program,
        'run',
      ])
    ).toBe(false);
    expect(isHeavyCommand('node', ['--no-warnings', '--version'])).toBe(false);
  });
});
