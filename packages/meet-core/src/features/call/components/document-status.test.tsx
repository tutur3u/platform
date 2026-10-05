// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';
import { DocumentStatus } from './document-status';

afterEach(cleanup);
function status(
  connected: boolean,
  checkpoint: 'saved' | 'deferred' | 'conflict' | null
) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <DocumentStatus connected={connected} checkpoint={checkpoint} />
    </NextIntlClientProvider>
  );
}
it('keeps a healthy connected document quiet', () => {
  status(true, 'saved');
  expect(screen.queryByRole('button')).toBeNull();
  expect(screen.queryByRole('status')).toBeNull();
  expect(screen.queryByText(/automatic sync/i)).toBeNull();
});
it('retains an accessible reconnecting announcement', () => {
  status(false, null);
  expect(screen.getByRole('status').textContent).toContain(
    messages.meet.collaboration.reconnecting
  );
});
it.each(['deferred', 'conflict'] as const)(
  'exposes %s backup status on a focusable tooltip trigger without an in-body alert',
  (checkpoint) => {
    status(true, checkpoint);
    const message =
      checkpoint === 'conflict'
        ? messages.meet.collaboration.checkpoint_conflict
        : messages.meet.collaboration.checkpoint_deferred;
    expect(screen.getByRole('button', { name: message })).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  }
);
