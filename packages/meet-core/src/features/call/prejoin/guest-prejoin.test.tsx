// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock('./use-prejoin-capture', () => ({
  usePrejoinCapture: () => ({
    devices: [],
    audioEnabled: true,
    videoEnabled: false,
    toggleAudio: vi.fn(),
    toggleVideo: vi.fn(),
    micStream: null,
    previewStream: null,
    previewError: null,
    micError: null,
    handedOff: false,
    limited: false,
    audioDeviceId: '',
    videoDeviceId: '',
    outputDeviceId: '',
    setAudioDeviceId: vi.fn(),
    setVideoDeviceId: vi.fn(),
    setOutputDeviceId: vi.fn(),
  }),
}));
vi.mock('../components/guest-turnstile', () => ({
  GuestTurnstile: ({
    onToken,
    onHumanPass,
  }: {
    onToken: (token: string) => void;
    onHumanPass: (token: string) => void;
  }) => (
    <div data-testid="human-check">
      <button type="button" onClick={() => onToken('cf-token')}>
        pass-turnstile
      </button>
      <button type="button" onClick={() => onHumanPass('puzzle-token')}>
        pass-puzzle
      </button>
    </div>
  ),
}));
vi.mock('../../live-assistant/mira-join-box', () => ({
  MiraJoinBox: ({ checked }: { checked: boolean }) => (
    <div data-testid="mira-box">{String(checked)}</div>
  ),
}));

import { GuestPrejoin, type GuestPrejoinState } from './guest-prejoin';

const guest = messages.meet.call.guest_join;

function show(
  state: GuestPrejoinState,
  extra: { name?: string; canAskHost?: boolean } = {}
) {
  const onSubmit = vi.fn();
  const onAskHost = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <GuestPrejoin
        canAskHost={extra.canAskHost ?? true}
        meetingId="m-1"
        miraTicked
        name={extra.name ?? 'Minh'}
        nameRef={null}
        onAskHost={onAskHost}
        onHumanPass={vi.fn()}
        onMiraChange={vi.fn()}
        onNameChange={vi.fn()}
        onStalledChange={vi.fn()}
        onSubmit={onSubmit}
        onToken={vi.fn()}
        onTokenLost={vi.fn()}
        returnTo="/r/abc"
        siteKey="site"
        stalled={false}
        state={state}
        statusLabel={guest.verifying}
        title="Weekly sync"
        widget={0}
      />
    </NextIntlClientProvider>
  );
  return { onSubmit, onAskHost };
}

afterEach(cleanup);

it('lays out the name, human check, unchanged Mira box and a held Ask to join', () => {
  show({ kind: 'verifying' });
  expect(screen.getByRole('textbox', { name: guest.name_label })).toBeTruthy();
  expect(screen.getByTestId('human-check')).toBeTruthy();
  expect(screen.getByTestId('mira-box').textContent).toBe('true');
  expect(
    screen.getByRole('button', { name: guest.ask_to_join })
  ).toHaveProperty('disabled', true);
});

it('keeps the host-approval fallback and the puzzle path while unverified', () => {
  const { onAskHost } = show({ kind: 'verifying' });
  fireEvent.click(
    screen.getByRole('button', { name: guest.ask_host_without_verification })
  );
  expect(onAskHost).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'pass-puzzle' })).toBeTruthy();
  expect(screen.getByRole('link', { name: guest.sign_in })).toBeTruthy();
});

it('enables Ask to join once verified and hides the fallback', () => {
  const { onSubmit } = show({ kind: 'verified' });
  expect(
    screen.queryByRole('button', { name: guest.ask_host_without_verification })
  ).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: guest.ask_to_join }));
  expect(onSubmit).toHaveBeenCalledTimes(1);
});

it('holds Ask to join without a name even when verified', () => {
  show({ kind: 'verified' }, { name: '  ' });
  expect(
    screen.getByRole('button', { name: guest.ask_to_join })
  ).toHaveProperty('disabled', true);
});

it('shows a busy Ask to join while the request is sent', () => {
  show({ kind: 'submitting', askingHost: false });
  const join = screen.getByRole('button', { name: guest.ask_to_join });
  expect(join).toHaveProperty('disabled', true);
  expect(join.getAttribute('aria-busy')).toBe('true');
});
