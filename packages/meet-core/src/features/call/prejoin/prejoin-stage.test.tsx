// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';
import vietnamese from '../../../../../../apps/meet/messages/vi.json';
import { PrejoinConnecting } from './prejoin-connecting';
import { PrejoinProvider } from './prejoin-context';
import { PrejoinStage, type PrejoinPhase } from './prejoin-stage';
import type { PrejoinCapture } from './use-prejoin-capture';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const call = messages.meet.call;

function capture(overrides: Partial<PrejoinCapture> = {}) {
  return {
    devices: [],
    audioEnabled: true,
    videoEnabled: false,
    toggleAudio: vi.fn(),
    toggleVideo: vi.fn(),
    audioDeviceId: '',
    setAudioDeviceId: vi.fn(),
    videoDeviceId: '',
    setVideoDeviceId: vi.fn(),
    outputDeviceId: '',
    setOutputDeviceId: vi.fn(),
    micStream: null,
    previewStream: null,
    previewError: null,
    micError: null,
    handedOff: false,
    limited: false,
    setLimit: vi.fn(),
    handOff: vi.fn(),
    release: vi.fn(),
    ...overrides,
  } as unknown as PrejoinCapture;
}

function show(
  phase: PrejoinPhase,
  extra: Partial<Parameters<typeof PrejoinStage>[0]> = {},
  locale: 'en' | 'vi' = 'en'
) {
  const onSubmit = vi.fn();
  render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === 'en' ? messages : vietnamese}
    >
      <PrejoinStage
        capture={capture()}
        name="Linh"
        onSubmit={onSubmit}
        phase={phase}
        title="Weekly sync"
        {...extra}
      />
    </NextIntlClientProvider>
  );
  return onSubmit;
}

afterEach(cleanup);

it('shows no name field when the profile already has a name', () => {
  show(
    { kind: 'ready', label: call.join_now },
    { fields: <p>Joining as Linh</p> }
  );
  expect(screen.queryByRole('textbox')).toBeNull();
  expect(screen.getByRole('button', { name: call.join_now })).toHaveProperty(
    'disabled',
    false
  );
});

it('turns Join into a busy spinner button while connecting, with no separate screen', () => {
  const onSubmit = show({ kind: 'connecting', label: call.join_now });
  const join = screen.getByRole('button', { name: new RegExp(call.join_now) });
  expect(join).toHaveProperty('disabled', true);
  expect(join.getAttribute('aria-busy')).toBe('true');
  expect(join.querySelector('svg.animate-spin')).toBeTruthy();
  expect(screen.getByText(call.connecting)).toBeTruthy();
  fireEvent.submit(join.closest('form') as HTMLFormElement);
  expect(onSubmit).not.toHaveBeenCalled();
});

it('shows the host wait with the same layout and a disabled Join', () => {
  show({ kind: 'waiting', label: call.waiting_for_host });
  expect(
    screen.getByRole('button', { name: call.waiting_for_host })
  ).toHaveProperty('disabled', true);
  expect(screen.getByRole('heading', { name: 'Weekly sync' })).toBeTruthy();
});

it('keeps Join sticky on a phone and after the fields in DOM order', () => {
  show(
    { kind: 'ready', label: call.join_now },
    {
      fields: <input aria-label="name field" />,
      notice: <p data-testid="notice">reserved</p>,
      secondary: <button type="button">leave</button>,
    }
  );
  const form = screen.getByRole('form', { name: 'Weekly sync' });
  const sticky = screen.getByRole('button', { name: call.join_now })
    .parentElement as HTMLElement;
  expect(sticky.className).toContain('sticky');
  expect(sticky.className).toContain('bottom-0');
  expect(form.lastElementChild).toBe(sticky);
  const order = [
    screen.getByTestId('notice'),
    screen.getByLabelText('name field'),
    sticky,
  ];
  for (let index = 1; index < order.length; index += 1)
    expect(
      (order[index - 1] as Node).compareDocumentPosition(order[index] as Node) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  expect(
    (screen.getByLabelText('name field').parentElement as HTMLElement).className
  ).toContain('scroll-mb-28');
});

it('offers Refresh on a connection error and submits it as a retry', () => {
  const onSubmit = show({
    kind: 'error',
    label: call.connection_refresh,
    message: call.join_error_hint,
  });
  fireEvent.click(
    screen.getByRole('button', { name: call.connection_refresh })
  );
  expect(onSubmit).toHaveBeenCalledTimes(1);
  expect(screen.getByText(call.join_error_hint)).toBeTruthy();
});

it('renders the device and preview labels in Vietnamese', () => {
  show({ kind: 'ready', label: vietnamese.meet.call.join_now }, {}, 'vi');
  expect(
    screen.getByRole('button', {
      name: vietnamese.meet.call.prejoin.devices,
    })
  ).toBeTruthy();
  expect(
    screen.getByRole('region', { name: vietnamese.meet.call.prejoin.preview })
  ).toBeTruthy();
});

it('shows the connecting stage from the provider before the room is ready', () => {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <PrejoinProvider
        info={{
          meetingName: 'Weekly sync',
          displayName: 'Linh',
          leaveHref: '/home',
        }}
      >
        <PrejoinConnecting />
      </PrejoinProvider>
    </NextIntlClientProvider>
  );
  expect(screen.getByRole('heading', { name: 'Weekly sync' })).toBeTruthy();
  expect(screen.getByText('Linh')).toBeTruthy();
  expect(
    screen.getByRole('button', { name: new RegExp(call.join_now) })
  ).toHaveProperty('disabled', true);
  expect(screen.getByRole('button', { name: call.prejoin.back })).toBeTruthy();
});

it('puts Back at the top left, before the layout and never beside Join', () => {
  const onBack = vi.fn();
  show(
    { kind: 'ready', label: call.join_now },
    { back: { label: call.prejoin.back, onClick: onBack } }
  );
  const back = screen.getByRole('button', { name: call.prejoin.back });
  const join = screen.getByRole('button', { name: call.join_now });
  expect(
    back.compareDocumentPosition(join) & Node.DOCUMENT_POSITION_FOLLOWING
  ).toBeTruthy();
  expect(back.closest('form')).toBeNull();
  fireEvent.click(back);
  expect(onBack).toHaveBeenCalledTimes(1);
  expect(screen.queryByText(call.leave)).toBeNull();
});

it('centres the block vertically without a fixed height', () => {
  show({ kind: 'ready', label: call.join_now });
  const main = screen.getByRole('main');
  expect(main.className).toContain('min-h-dvh');
  expect(main.firstElementChild?.className).toContain('content-center');
  expect(main.innerHTML).not.toMatch(/\bh-\[?\d+(vh|dvh)/);
});
