// @vitest-environment jsdom
import type { MeetRealtimePresence } from '@tuturuuu/realtime/meet';
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';
import { CallPresenceRoster } from './call-presence-roster';

afterEach(cleanup);

it('wraps a long name instead of truncating it to one line', () => {
  const longName = 'Nguyễn Thị Minh Khai Phương Anh';
  const person = {
    userId: 'self',
    displayName: longName,
    media: { audioEnabled: false, videoEnabled: false, screenEnabled: false },
  } as MeetRealtimePresence;
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <CallPresenceRoster
        participants={[person]}
        selfUserId="self"
        raisedHandUserIds={[]}
      />
    </NextIntlClientProvider>
  );
  const label = screen.getByText(new RegExp(longName));
  expect(label.textContent).toContain(longName);
  expect(label.classList.contains('truncate')).toBe(false);
  expect(label.classList.contains('line-clamp-2')).toBe(true);
  expect(label.getAttribute('title')).toBe(longName);
  // The item grows with the name up to a cap instead of a fixed narrow width.
  expect(label.closest('li')?.classList.contains('w-20')).toBe(false);
});
