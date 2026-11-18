// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';
import { MiraPermissionsCard } from './mira-permissions-card';

const labels = messages.meet.call.miraEverywhere.permissions;
afterEach(cleanup);

it('lists the boundaries and leaves unavailable capabilities read-only', () => {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <MiraPermissionsCard />
    </NextIntlClientProvider>
  );
  for (const label of [
    labels.draft,
    labels.editDocs,
    labels.suggestCode,
    labels.readPrivate,
    labels.blocked,
  ]) {
    expect(screen.getByText(label)).toBeTruthy();
  }
  expect(screen.getAllByText(labels.unavailable)).toHaveLength(3);
  expect(screen.queryByRole('switch')).toBeNull();
});

it('asks the host callback to toggle only a public capability and leaves a failed setting intact', async () => {
  const onToggle = vi.fn(async () => {
    throw new Error('Denied');
  });
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <MiraPermissionsCard
        enabled={{ draft: true, editDocs: false, suggestCode: true }}
        onToggle={onToggle}
      />
    </NextIntlClientProvider>
  );
  const draft = screen.getByRole('switch', { name: labels.draft });
  expect(screen.getAllByRole('switch')).toHaveLength(3);
  expect(screen.queryByRole('switch', { name: labels.readPrivate })).toBeNull();
  fireEvent.click(draft);
  expect(onToggle).toHaveBeenCalledWith('draft', false);
  expect((await screen.findByRole('alert')).textContent).toBe(labels.failed);
  expect(draft.getAttribute('aria-checked')).toBe('true');
});
