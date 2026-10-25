import { afterEach, expect, it, vi } from 'vitest';

const entries = vi.hoisted(() => ({
  resources: vi.fn(),
  general: vi.fn(),
  operational: vi.fn(),
  secrets: vi.fn(),
}));
vi.mock('./resources.js', () => ({ runResourcesCommand: entries.resources }));
vi.mock('./secrets.js', () => ({ runSecretsCommand: entries.secrets }));
vi.mock('./commands.js', () => {
  entries.general();
  throw new Error('general commands loaded');
});
vi.mock('./operational-cli.js', () => ({
  runOperationalCli: entries.operational,
}));
const argv = process.argv;
afterEach(() => {
  process.argv = argv;
  process.exitCode = 0;
  vi.clearAllMocks();
  vi.resetModules();
  vi.restoreAllMocks();
});
it('routes resources arguments only to the lightweight resource module', async () => {
  process.argv = [
    'bun',
    'index.ts',
    'resources',
    'run',
    '--no-update-check',
    '--',
    'printf',
    'marker',
  ];
  await import('./index');
  await vi.waitFor(() =>
    expect(entries.resources).toHaveBeenCalledWith([
      'run',
      '--no-update-check',
      '--',
      'printf',
      'marker',
    ])
  );
  expect(entries.general).not.toHaveBeenCalled();
  expect(entries.operational).not.toHaveBeenCalled();
});
it('retains the entry error message and exit status for resource failures', async () => {
  entries.resources.mockRejectedValueOnce(
    new Error('Unknown run option: --bad')
  );
  const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  process.argv = ['bun', 'index.ts', 'resources', 'run', '--bad'];
  await import('./index');
  await vi.waitFor(() => expect(process.exitCode).toBe(1));
  expect(stderr).toHaveBeenCalledWith('Unknown run option: --bad\n');
  expect(entries.general).not.toHaveBeenCalled();
});
it('routes secrets arguments only to the lightweight secrets module, including -v', async () => {
  process.argv = [
    'bun',
    'index.ts',
    'secrets',
    'get',
    'label',
    '--to-file',
    '/tmp/out',
    '-v',
  ];
  await import('./index');
  await vi.waitFor(() =>
    expect(entries.secrets).toHaveBeenCalledWith([
      'get',
      'label',
      '--to-file',
      '/tmp/out',
      '-v',
    ])
  );
  expect(entries.general).not.toHaveBeenCalled();
  expect(entries.resources).not.toHaveBeenCalled();
});
