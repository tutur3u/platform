// @vitest-environment-options {"url":"https://tuturuuu.com/personal"}
import { screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  renderAppsLauncherDialog,
  setupAppsLauncherTestEnvironment,
  teardownAppsLauncherTestEnvironment,
} from './apps-launcher-test-utils';

vi.mock('next/link', () => ({
  default: (props: ComponentProps<'a'>) => <a {...props} data-router-link="" />,
}));

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
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_TUTURUUU_ACTIVE_APP_MOUNTS', mounts);
    renderAppsLauncherDialog({ workspace });

    for (const [name, path] of [
      ['Workspace Platform', `/${workspacePath}?source=sidebar-apps`],
      ['Meet', '/meet/personal/meetings'],
      ['Mail', `/mail/${workspacePath}/inbox?source=sidebar-apps`],
      ['Calendar', `/calendar/${workspacePath}?source=sidebar-apps`],
    ]) {
      const option = screen.getByRole('option', { name });
      expect(option.getAttribute('href')).toBe(`https://tuturuuu.com${path}`);
      expect(option.hasAttribute('data-router-link')).toBe(false);
    }
    expect(
      screen
        .getByRole('option', { name: 'Finance' })
        .hasAttribute('data-router-link')
    ).toBe(true);
  }
);
