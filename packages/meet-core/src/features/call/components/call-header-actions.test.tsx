// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';

const phone = vi.hoisted(() => ({ on: false }));
vi.mock('../phone/use-phone-chrome', () => ({
  usePhoneChrome: () => phone.on,
}));

import { CallHeaderActions } from './call-header-actions';

const call = messages.meet.call;

function show(extra: { mira?: boolean } = {}) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <CallHeaderActions
        clock={<span data-testid="clock">12:00</span>}
        mira={
          extra.mira === false ? undefined : <button type="button">Mira</button>
        }
        notice={<span>notice</span>}
        settings={<button type="button">settings</button>}
        share={<button type="button">Share</button>}
        sharedAudio={<button type="button">shared-audio</button>}
        volume={<button type="button">volume</button>}
      />
    </NextIntlClientProvider>
  );
}

afterEach(() => {
  cleanup();
  phone.on = false;
});

it('keeps every control in the original order off a phone', () => {
  show();
  const order = [
    'notice',
    'Mira',
    'volume',
    'shared-audio',
    'settings',
    '12:00',
    'Share',
  ];
  const text = document.body.textContent ?? '';
  let last = -1;
  for (const label of order) {
    const index = text.indexOf(label);
    expect(index).toBeGreaterThan(last);
    last = index;
  }
  expect(screen.queryByRole('button', { name: call.more_actions })).toBeNull();
});

it('keeps the timer, Mira and Share on a phone and moves the rest into More', () => {
  phone.on = true;
  show();
  expect(screen.getByTestId('clock')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Mira' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Share' })).toBeTruthy();
  // Capture, consent and the private-Mira status stay mounted in the bar.
  expect(screen.getByText('notice')).toBeTruthy();
  expect(screen.queryByText('volume')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: call.more_actions }));
  for (const name of ['volume', 'shared-audio', 'settings'])
    expect(screen.getByRole('button', { name })).toBeTruthy();
  expect(screen.getByText(call.playback_volume)).toBeTruthy();
  expect(screen.getByText(call.settings_title)).toBeTruthy();
});

it('omits rows for controls a presence-only room does not have', () => {
  phone.on = true;
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <CallHeaderActions
        clock={null}
        notice={null}
        settings={<button type="button">settings</button>}
        share={null}
      />
    </NextIntlClientProvider>
  );
  fireEvent.click(screen.getByRole('button', { name: call.more_actions }));
  expect(screen.getByRole('button', { name: 'settings' })).toBeTruthy();
  expect(screen.queryByText(call.playback_volume)).toBeNull();
});
