// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';
import { MiraPermissionsCard } from './mira-permissions-card';
import { MiraPrivateShareChip } from './mira-private-share';

const labels = messages.meet.call.miraEverywhere.permissions;
afterEach(cleanup);

const share = (enabled: boolean) => ({
  enabled,
  pending: false,
  onChange: vi.fn(async (_enabled: boolean) => undefined),
});
const wrap = (node: ReactNode) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {node}
    </NextIntlClientProvider>
  );

it('lists the fixed rules and gives the viewer their own off-by-default switch', () => {
  const control = share(false);
  wrap(
    <MiraPermissionsCard
      enabled={{ draft: true, editDocs: true, suggestCode: true }}
      fixedRules
      privateShare={control}
    />
  );
  expect(screen.queryByText(labels.host)).toBeNull();
  expect(screen.queryByText(labels.blocked)).toBeNull();
  expect(screen.getByText(labels.privateOwnerOnly)).toBeTruthy();
  const toggle = screen.getByRole('switch', { name: labels.shareToggle });
  expect(toggle.getAttribute('aria-checked')).toBe('false');
  expect(screen.getAllByRole('switch')).toHaveLength(1);
  fireEvent.click(toggle);
  expect(control.onChange).toHaveBeenCalledWith(true);
});

it('keeps private data blocked when no owner switch is offered', () => {
  wrap(<MiraPermissionsCard />);
  expect(screen.getByText(labels.blocked)).toBeTruthy();
  expect(screen.queryByRole('switch', { name: labels.shareToggle })).toBeNull();
});

it('shows a chip only while shared and revokes in one tap', async () => {
  const off = share(false);
  const { unmount } = wrap(<MiraPrivateShareChip share={off} />);
  expect(screen.queryByText(labels.chipShared)).toBeNull();
  unmount();

  const on = share(true);
  wrap(<MiraPrivateShareChip share={on} />);
  expect(screen.getByText(labels.chipShared)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: labels.stopSharing }));
  expect(on.onChange).toHaveBeenCalledWith(false);
});

it('says so when a revoke fails', async () => {
  const failing = {
    ...share(true),
    onChange: vi.fn(async (_enabled: boolean) => {
      throw new Error('Denied');
    }),
  };
  wrap(<MiraPrivateShareChip share={failing} />);
  fireEvent.click(screen.getByRole('button', { name: labels.stopSharing }));
  expect(await screen.findByText(labels.failed)).toBeTruthy();
});
