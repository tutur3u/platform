// @vitest-environment jsdom
import type { MeetRealtimePresence } from '@tuturuuu/realtime/meet';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';

const phone = vi.hoisted(() => ({ on: true }));
vi.mock('../phone/use-phone-chrome', () => ({
  usePhoneChrome: () => phone.on,
}));

import { ParticipantTile } from './participant-tile';

const participant = {
  userId: 'peer',
  displayName: 'Peer',
  media: { audioEnabled: true, videoEnabled: false, screenEnabled: true },
} as MeetRealtimePresence;

function setup(onFocus = vi.fn()) {
  const view = render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ParticipantTile
        participant={participant}
        kind="screen"
        onFocus={onFocus}
        resumePlaybackLabel="Play audio"
      />
    </NextIntlClientProvider>
  );
  const tile = view.getByTestId('participant-peer-screen');
  const pill = () =>
    view.getByLabelText('Focus on screen').parentElement as HTMLElement;
  return { ...view, tile, pill, onFocus };
}

beforeEach(() => {
  phone.on = true;
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it('hides the tile actions on a phone until the tile is tapped', () => {
  const { tile, pill } = setup();
  expect(pill().className).toContain('opacity-0');
  expect(pill().className).toContain('pointer-events-none');
  fireEvent.click(tile);
  expect(pill().className).toContain('opacity-100');
  expect(pill().className).not.toContain('pointer-events-none');
});

it('uses 44 px targets and hides the actions again after a pause', () => {
  const { tile, pill, getByLabelText } = setup();
  fireEvent.click(tile);
  expect(getByLabelText('Focus this feed').className).toContain('size-11');
  act(() => {
    vi.advanceTimersByTime(5100);
  });
  expect(pill().className).toContain('opacity-0');
});

it('runs a pressed action without toggling the pill and keeps it reachable by focus', () => {
  const { tile, pill, getByLabelText, onFocus } = setup();
  fireEvent.click(tile);
  fireEvent.click(getByLabelText('Focus this feed'));
  expect(onFocus).toHaveBeenCalledTimes(1);
  expect(pill().className).toContain('opacity-100');
  expect(pill().className).toContain('focus-within:opacity-100');
});

it('keeps the hover-based actions off a phone layout', () => {
  phone.on = false;
  const { tile, pill } = setup();
  expect(pill().className).toContain('sm:group-hover:opacity-100');
  fireEvent.click(tile);
  expect(pill().className).toContain('sm:opacity-0');
});
