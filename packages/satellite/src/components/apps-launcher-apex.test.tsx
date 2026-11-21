// @vitest-environment-options {"url":"https://tuturuuu.com/personal"}
import { screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  renderAppsLauncherDialog,
  setupAppsLauncherTestEnvironment,
  teardownAppsLauncherTestEnvironment,
} from './apps-launcher-test-utils';

beforeEach(setupAppsLauncherTestEnvironment);
afterEach(() => {
  teardownAppsLauncherTestEnvironment();
  vi.unstubAllEnvs();
});

it.each([
  { mounts: '', workspace: undefined, workspacePath: 'personal' },
  {
    mounts: 'mail,calendar,meet',
    workspace: undefined,
    workspacePath: 'personal',
  },
  {
    mounts: 'mail,calendar,meet',
    workspace: { id: 'team-workspace', name: 'Team', personal: false },
    workspacePath: 'team-workspace',
  },
])(
  'opens apex destinations for $workspacePath with mounts "$mounts"',
  ({ mounts, workspace, workspacePath }) => {
    vi.stubEnv('NEXT_PUBLIC_TUTURUUU_ACTIVE_APP_MOUNTS', mounts);
    renderAppsLauncherDialog({ workspace });

    for (const [name, path] of [
      ['Meet', '/meet/personal/meetings'],
      ['Mail', `/mail/${workspacePath}/inbox?source=sidebar-apps`],
      ['Calendar', `/calendar/${workspacePath}?source=sidebar-apps`],
    ]) {
      expect(screen.getByRole('option', { name }).getAttribute('href')).toBe(
        `https://tuturuuu.com${path}`
      );
    }
  }
);
