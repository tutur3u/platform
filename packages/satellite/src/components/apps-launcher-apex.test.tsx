// @vitest-environment-options {"url":"https://tuturuuu.com/personal"}
import { fireEvent, screen } from '@testing-library/react';
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

it('registers only current-tab public Tools document prefetch while open', async () => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('NEXT_PUBLIC_TUTURUUU_ACTIVE_APP_MOUNTS', 'tools,apps,mail,meet');
  const readRules = () =>
    document.head.querySelector('script[data-slot="apps-launcher-prefetch"]');

  renderAppsLauncherDialog();
  expect(readRules()).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'Open options' }));
  fireEvent.click(await screen.findByRole('radio', { name: 'This tab' }));
  const script = readRules();
  expect(script?.getAttribute('type')).toBe('speculationrules');
  const rules = JSON.parse(script?.textContent ?? '{}');
  const selector =
    'a[data-app-slug="tools"][role="option"][href="https://tuturuuu.com/tools?source=sidebar-apps"]:not([target])';
  expect(rules).toEqual({
    prefetch: [
      {
        source: 'document',
        where: { selector_matches: selector },
        eagerness: 'moderate',
      },
    ],
  });
  expect([...document.querySelectorAll(selector)]).toEqual([
    screen.getByRole('option', { name: 'Tools' }),
  ]);
  expect(
    screen
      .getByRole('option', { name: 'Tools' })
      .hasAttribute('data-router-link')
  ).toBe(false);

  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  expect(readRules()).toBeNull();
});
