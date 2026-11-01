// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import en from '../../../../../../apps/meet/messages/en.json';
import viMessages from '../../../../../../apps/meet/messages/vi.json';
import { LobbyDevicePickers, LobbyParticipantSummary } from './lobby-controls';

function localized(child: ReactNode, locale: 'en' | 'vi' = 'en') {
  return (
    <NextIntlClientProvider
      locale={locale}
      messages={locale === 'en' ? en : viMessages}
      timeZone="UTC"
    >
      {child}
    </NextIntlClientProvider>
  );
}

const devices = [
  { kind: 'audioinput', deviceId: 'mic-usb', label: 'USB Studio Mic' },
  { kind: 'videoinput', deviceId: 'cam-ext', label: '4K Webcam' },
  { kind: 'audiooutput', deviceId: 'spk-desk', label: 'Desk Speakers' },
] as MediaDeviceInfo[];

function pickerProps(
  overrides: Partial<Parameters<typeof LobbyDevicePickers>[0]> = {}
) {
  return {
    devices,
    audioDeviceId: '',
    videoDeviceId: '',
    outputDeviceId: '',
    onAudioDeviceChange: vi.fn(),
    onVideoDeviceChange: vi.fn(),
    onOutputDeviceChange: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.releasePointerCapture = vi.fn();
  Object.defineProperty(HTMLMediaElement.prototype, 'setSinkId', {
    configurable: true,
    value: vi.fn(async () => {}),
  });
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(HTMLMediaElement.prototype, 'setSinkId');
});

it.each(['en', 'vi'] as const)(
  'formats the overflow roster line as one ICU message in %s',
  (locale) => {
    const roster = [
      { userId: 'u1', displayName: 'Alice Nguyen' },
      { userId: 'u2', displayName: 'Bao Le' },
      { userId: 'u3', displayName: 'Chi Pham' },
      { userId: 'u4', displayName: 'Dung Vo' },
      { userId: 'u5', displayName: 'Giang Ho' },
    ];
    const view = render(
      localized(
        <LobbyParticipantSummary
          connected
          participants={roster}
          waiting={false}
        />,
        locale
      )
    );

    const expected =
      locale === 'en'
        ? 'Alice Nguyen, Bao Le, Chi Pham, Dung Vo (+1 more)'
        : 'Alice Nguyen, Bao Le, Chi Pham, Dung Vo (+1 người khác)';
    expect(within(view.container).getByText(expected)).toBeTruthy();
  }
);

it('gives each picker instance its own label/control ids', () => {
  render(
    localized(
      <>
        <LobbyDevicePickers {...pickerProps()} />
        <LobbyDevicePickers {...pickerProps()} />
      </>
    )
  );

  const triggers = screen.getAllByLabelText(en.meet.call.audio_input);
  expect(triggers).toHaveLength(2);
  expect(triggers[0]?.id).toBeTruthy();
  expect(triggers[0]?.id).not.toBe(triggers[1]?.id);
});

it('lets "System default" recover a selected device that is no longer listed', async () => {
  const props = pickerProps({ audioDeviceId: 'mic-unplugged' });
  render(localized(<LobbyDevicePickers {...props} />));

  const trigger = screen.getByLabelText(en.meet.call.audio_input);
  expect(trigger.textContent).toContain(en.meet.call.system_default);

  fireEvent.click(trigger);
  fireEvent.click(
    await screen.findByRole('option', { name: en.meet.call.system_default })
  );
  expect(props.onAudioDeviceChange).toHaveBeenCalledWith('');
});
