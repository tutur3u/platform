// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import type { MeetRoomSettings } from '@tuturuuu/realtime/meet';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';
import { buildJoinUrl } from '../lib/room-code';
import { JoinQrSwitch } from './join-qr-controls';
import { StageJoinQr } from './stage-join-qr';

const mocks = vi.hoisted(() => ({ ux: true }));
vi.mock('../prejoin/use-meet-call-ux', () => ({
  useMeetCallUx: () => mocks.ux,
}));
vi.mock('qrcode.react', () => ({
  QRCodeSVG: ({ value }: { value: string }) => (
    <svg data-testid="qr" data-value={value} />
  ),
}));

const meetingId = '00000000-0000-4000-8000-000000000001';
const copy = messages.meet.call.join_qr;
const base: MeetRoomSettings = { shareNotes: false };

const wrap = (node: ReactNode) => (
  <NextIntlClientProvider locale="en" messages={messages}>
    {node}
  </NextIntlClientProvider>
);
const card = () => screen.queryByRole('figure');

beforeEach(() => {
  mocks.ux = true;
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('StageJoinQr', () => {
  it('is absent from the classic room', () => {
    mocks.ux = false;
    render(wrap(<StageJoinQr meetingId={meetingId} settings={base} />));
    expect(screen.queryByTestId('stage-join-qr')).toBeNull();
  });

  it('encodes the same join link the Share dialog gives guests', () => {
    render(wrap(<StageJoinQr meetingId={meetingId} settings={base} />));
    expect(screen.getByTestId('qr').getAttribute('data-value')).toBe(
      buildJoinUrl(window.location.origin, meetingId)
    );
    expect(card()).not.toBeNull();
    expect(screen.getByRole('button', { name: copy.show })).toBeTruthy();
  });

  it('stays hidden while a manager has hidden it', () => {
    render(
      wrap(
        <StageJoinQr
          meetingId={meetingId}
          settings={{ ...base, joinQrHidden: true }}
        />
      )
    );
    expect(screen.queryByTestId('stage-join-qr')).toBeNull();
  });

  it('hides itself when the auto-hide minutes pass', () => {
    vi.useFakeTimers();
    const settings: MeetRoomSettings = {
      ...base,
      joinQrAutoHide: 2,
      joinQrShownAt: new Date().toISOString(),
    };
    render(wrap(<StageJoinQr meetingId={meetingId} settings={settings} />));
    act(() => vi.advanceTimersByTime(119_000));
    expect(screen.queryByTestId('stage-join-qr')).not.toBeNull();
    act(() => vi.advanceTimersByTime(1_000));
    expect(screen.queryByTestId('stage-join-qr')).toBeNull();
  });

  it('keeps to the chip while an activity is open', () => {
    render(wrap(<StageJoinQr meetingId={meetingId} settings={base} compact />));
    expect(card()).toBeNull();
    const chip = screen.getByRole('button', { name: copy.show });
    expect(chip.className).not.toContain('lg:hidden');
  });

  it('shrinks to the chip for this viewer and hands focus back', () => {
    render(wrap(<StageJoinQr meetingId={meetingId} settings={base} />));
    fireEvent.click(screen.getByRole('button', { name: copy.minimize }));
    expect(card()).toBeNull();
    const [restore] = screen.getAllByRole('button', { name: copy.show });
    expect(document.activeElement).toBe(restore);
    fireEvent.click(restore!);
    expect(card()).not.toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: copy.minimize })
    );
  });

  it('offers room options to hosts and co-hosts only', () => {
    const onSettings = vi.fn();
    const { rerender } = render(
      wrap(<StageJoinQr meetingId={meetingId} settings={base} />)
    );
    expect(screen.queryByRole('button', { name: copy.options })).toBeNull();
    rerender(
      wrap(
        <StageJoinQr
          meetingId={meetingId}
          settings={base}
          onSettings={onSettings}
        />
      )
    );
    const open = () =>
      fireEvent.keyDown(screen.getByRole('button', { name: copy.options }), {
        key: 'Enter',
      });
    open();
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'After 5 min' }));
    expect(onSettings).toHaveBeenLastCalledWith({ joinQrAutoHide: 5 });
    open();
    fireEvent.click(screen.getByRole('menuitem', { name: copy.hide_all }));
    expect(onSettings).toHaveBeenLastCalledWith({ joinQrHidden: true });
  });
});

describe('JoinQrSwitch', () => {
  it('shows and hides the QR for the room', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      wrap(<JoinQrSwitch settings={base} onChange={onChange} />)
    );
    const toggle = screen.getByRole('switch', { name: copy.switch });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(toggle);
    expect(onChange).toHaveBeenLastCalledWith({ joinQrHidden: true });
    rerender(
      wrap(
        <JoinQrSwitch
          settings={{ ...base, joinQrHidden: true }}
          onChange={onChange}
        />
      )
    );
    const hidden = screen.getByRole('switch', { name: copy.switch });
    expect(hidden.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(hidden);
    expect(onChange).toHaveBeenLastCalledWith({ joinQrHidden: false });
  });
});
