import { describe, expect, it } from 'vitest';
import { createDevboxSetupPlan } from './setup';

describe('createDevboxSetupPlan', () => {
  it('creates Homebrew commands for missing macOS tools', () => {
    expect(
      createDevboxSetupPlan({
        missingTools: ['node', 'bun', 'docker', 'git'],
        packageManager: 'brew',
        platform: 'darwin',
      }).commands
    ).toEqual([
      ['brew', 'install', 'node'],
      ['brew', 'install', 'bun'],
      ['brew', 'install', '--cask', 'docker'],
      ['brew', 'install', 'git'],
    ]);
  });

  it('uses winget for Windows setup when available', () => {
    expect(
      createDevboxSetupPlan({
        missingTools: ['node', 'bun'],
        packageManager: 'winget',
        platform: 'win32',
      }).commands
    ).toEqual([
      ['winget', 'install', 'OpenJS.NodeJS.LTS'],
      ['winget', 'install', 'Oven-sh.Bun'],
    ]);
  });
});
