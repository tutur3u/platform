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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';
import { useStageJoinQr } from '../hooks/use-stage-join-qr';
import { type CallState, INITIAL_CALL_STATE } from '../lib/call-state';
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

function roomState(patch: Partial<CallState> = {}): CallState {
  return { ...INITIAL_CALL_STATE, settingsFeatures: ['joinQr'], ...patch };
}

function Stage({
  state = roomState(),
  activityOpen = false,
  onSettings,
}: {
  state?: CallState;
  activityOpen?: boolean;
  onSettings?: (patch: object) => void;
}) {
  const qr = useStageJoinQr(state, activityOpen);
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      <StageJoinQr
        meetingId={meetingId}
        qr={qr}
        settings={state.settings}
        onSettings={onSettings}
      />
    </NextIntlClientProvider>
  );
}

const card = () => screen.queryByRole('figure');
const stageQr = () => screen.queryByTestId('stage-join-qr');

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
    render(<Stage />);
    expect(stageQr()).toBeNull();
  });

  it('is on by default and encodes the link the Share dialog gives', () => {
    render(<Stage state={{ ...INITIAL_CALL_STATE }} />);
    expect(screen.getByTestId('qr').getAttribute('data-value')).toBe(
      buildJoinUrl(window.location.origin, meetingId)
    );
    expect(card()).not.toBeNull();
    expect(screen.getByRole('button', { name: copy.show })).toBeTruthy();
  });

  it('stays hidden while a manager has hidden it', () => {
    render(
      <Stage
        state={roomState({ settings: { ...base, joinQrHidden: true } })}
      />
    );
    expect(stageQr()).toBeNull();
  });

  it('hides itself when the auto-hide minutes pass', () => {
    vi.useFakeTimers();
    const now = new Date().toISOString();
    const settings: MeetRoomSettings = {
      ...base,
      joinQrAutoHide: 2,
      joinQrShownAt: now,
    };
    render(<Stage state={roomState({ settings, settingsClockSkew: 0 })} />);
    act(() => vi.advanceTimersByTime(119_000));
    expect(stageQr()).not.toBeNull();
    act(() => vi.advanceTimersByTime(1_000));
    expect(stageQr()).toBeNull();
  });

  it('reads auto-hide on the room clock when this device runs fast', () => {
    vi.useFakeTimers();
    const roomNow = '2026-11-25T08:00:00.000Z';
    // This device is ten minutes ahead of the room.
    vi.setSystemTime(Date.parse(roomNow) + 600_000);
    const settings: MeetRoomSettings = {
      ...base,
      joinQrAutoHide: 2,
      joinQrShownAt: roomNow,
    };
    render(
      <Stage state={roomState({ settings, settingsClockSkew: -600_000 })} />
    );
    expect(stageQr()).not.toBeNull();
    act(() => vi.advanceTimersByTime(119_000));
    expect(stageQr()).not.toBeNull();
    act(() => vi.advanceTimersByTime(1_000));
    expect(stageQr()).toBeNull();
  });

  it('keeps to the chip while an activity is open', () => {
    render(<Stage activityOpen />);
    expect(card()).toBeNull();
    const chip = screen.getByRole('button', { name: copy.show });
    expect(chip.className).not.toContain('lg:hidden');
  });

  it('lifts the chip above the bottom-left tile name strip', () => {
    render(<Stage activityOpen />);
    const chipForm = stageQr()!.className;
    expect(chipForm).toContain('bottom-16');
    expect(chipForm).not.toContain('lg:bottom-4');
    cleanup();
    // With room for the card, the card keeps to the corner from lg up.
    render(<Stage />);
    expect(stageQr()!.className).toContain('lg:bottom-4');
  });

  it('keeps to the chip in a presence-only room', () => {
    render(
      <Stage
        state={roomState({ settings: { ...base, transport: 'presence' } })}
      />
    );
    expect(card()).toBeNull();
  });

  it('shrinks to the chip for this viewer and hands focus back', () => {
    render(<Stage />);
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

  it('offers room options only when given a settings writer', () => {
    const onSettings = vi.fn();
    const { rerender } = render(<Stage />);
    expect(screen.queryByRole('button', { name: copy.options })).toBeNull();
    rerender(<Stage onSettings={onSettings} />);
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
  const renderSwitch = (
    settings: MeetRoomSettings,
    supported: boolean,
    onChange = vi.fn(),
    clockSkew?: number
  ) =>
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <JoinQrSwitch
          settings={settings}
          clockSkew={clockSkew}
          supported={supported}
          onChange={onChange}
        />
      </NextIntlClientProvider>
    );

  it('reads off when More opens after the QR auto-hid', () => {
    vi.useFakeTimers();
    const shownAt = '2026-11-25T08:00:00.000Z';
    // The switch mounts with the More menu, seven minutes after a 5-minute
    // auto-hide started, on a device whose clock matches the room.
    vi.setSystemTime(Date.parse(shownAt) + 7 * 60_000);
    const onChange = vi.fn();
    renderSwitch(
      { ...base, joinQrAutoHide: 5, joinQrShownAt: shownAt },
      true,
      onChange,
      0
    );
    const toggle = screen.getByRole('switch', { name: copy.switch });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(toggle);
    expect(onChange).toHaveBeenLastCalledWith({ joinQrHidden: false });
  });

  it('keeps the arrival skew when More opens late on a fast device', () => {
    vi.useFakeTimers();
    const shownAt = '2026-11-25T08:00:00.000Z';
    // Ten minutes ahead of the room, opened three minutes into a 5-minute
    // auto-hide: still shown on the room's clock.
    vi.setSystemTime(Date.parse(shownAt) + 13 * 60_000);
    renderSwitch(
      { ...base, joinQrAutoHide: 5, joinQrShownAt: shownAt },
      true,
      vi.fn(),
      -600_000
    );
    expect(
      screen
        .getByRole('switch', { name: copy.switch })
        .getAttribute('aria-checked')
    ).toBe('true');
  });

  it('shows and hides the QR in a room that keeps the setting', () => {
    const onChange = vi.fn();
    renderSwitch(base, true, onChange);
    const toggle = screen.getByRole('switch', { name: copy.switch });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    expect(screen.queryByText(copy.unavailable)).toBeNull();
    fireEvent.click(toggle);
    expect(onChange).toHaveBeenLastCalledWith({ joinQrHidden: true });
    cleanup();
    renderSwitch({ ...base, joinQrHidden: true }, true, onChange);
    const hidden = screen.getByRole('switch', { name: copy.switch });
    expect(hidden.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(hidden);
    expect(onChange).toHaveBeenLastCalledWith({ joinQrHidden: false });
  });

  it('stays off with a note in a room that drops the setting', () => {
    const onChange = vi.fn();
    renderSwitch(base, false, onChange);
    const toggle = screen.getByRole('switch', { name: copy.switch });
    expect(toggle.hasAttribute('disabled')).toBe(true);
    expect(screen.getByText(copy.unavailable)).toBeTruthy();
    fireEvent.click(toggle);
    expect(onChange).not.toHaveBeenCalled();
  });
});
