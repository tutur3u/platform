// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({
  read: vi.fn(),
  legacyChoice: vi.fn(),
  mira: vi.fn(),
  miraChoose: vi.fn(),
  json: vi.fn(),
  upload: vi.fn(),
  engine: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api/client', () => ({
  getInternalApiClient: () => ({ json: f.json }),
}));
vi.mock('@tuturuuu/internal-api', () => ({
  readMeetTranscriptConsent: f.read,
  setMeetTranscriptChoice: f.legacyChoice,
  readRoomMiraConsent: f.mira,
  setRoomMiraChoice: f.miraChoose,
  acceptRoomMira: vi.fn(),
  turnOffRoomMira: vi.fn(),
  reportRoomMiraMinor: vi.fn(),
  getInternalApiClient: () => ({ json: f.json }),
  uploadMeetAiChunk: f.upload,
}));
vi.mock('./self-engine', () => ({ createSelfEngine: f.engine }));
vi.mock('@tuturuuu/ui/sonner', () => ({ toast: { error: vi.fn() } }));

import { RoomMiraSelfChoice } from '../call/components/room-mira-notice';
import { useRoomMira } from '../call/components/use-room-mira';
import { forgetMiraJoinChoice } from '../live-assistant/mira-join-choice';
import {
  ai,
  conflict,
  grant,
  mc,
  miraOn,
  Providers,
  room,
  view,
} from './self-fences.fixtures';
import { resetSelfCaptureFlags } from './self-hold';
import { TranscriptControls } from './transcript-controls';

const undecided = { ...miraOn, choice: null, lastChoice: null };
const showChoice = () =>
  render(
    <Providers>
      <RoomMiraSelfChoice meetingId="m" />
    </Providers>
  );

beforeEach(() => {
  vi.resetAllMocks();
  resetSelfCaptureFlags('m');
  forgetMiraJoinChoice('m');
  f.read.mockResolvedValue(view());
  f.mira.mockResolvedValue(miraOn);
  f.legacyChoice.mockResolvedValue({});
});
afterEach(cleanup);

describe('Mira choices after review', () => {
  it('starts a re-confirmation unticked, so confirming without ticking never turns Mira on', async () => {
    f.mira.mockResolvedValue({
      ...miraOn,
      noticeMode: 'self',
      noticeStale: true,
    });
    f.miraChoose.mockResolvedValue({ ...miraOn, choice: 'off' });
    showChoice();
    const box = await screen.findByRole('checkbox', { name: mc.box_label });
    expect(box.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: mc.confirm }));
    await vi.waitFor(() => expect(f.miraChoose).toHaveBeenCalledTimes(1));
    expect(f.miraChoose.mock.calls[0]![1].choice).toBe('off');
  });

  it('reads Mira again when a transcript Allow is refused for a stale Mira notice', async () => {
    f.read.mockResolvedValue(view({ choice: null }));
    f.json.mockImplementation((path: string) =>
      path.endsWith('/self/choice')
        ? Promise.reject(conflict('MIRA_ROOM_NOTICE_MODE_STALE'))
        : Promise.resolve(grant())
    );
    render(
      <Providers>
        <TranscriptControls room={room} meetingId="m" wsId="w" guest={false} />
      </Providers>
    );
    const allow = await screen.findByRole('button', { name: ai.consent_allow });
    const reads = f.mira.mock.calls.length;
    fireEvent.click(allow);
    await vi.waitFor(() =>
      expect(f.mira.mock.calls.length).toBeGreaterThan(reads)
    );
  });

  it('lets the person record an untick while the meeting notice is unknown', async () => {
    f.read.mockReturnValue(new Promise(() => undefined));
    f.mira.mockResolvedValue(undecided);
    f.miraChoose.mockResolvedValue({ ...undecided, choice: 'off' });
    showChoice();
    const confirm = await screen.findByRole('button', { name: mc.confirm });
    // Ticked, it waits for the notice; unticked, it records off at once.
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: mc.box_label }));
    await vi.waitFor(() =>
      expect((confirm as HTMLButtonElement).disabled).toBe(false)
    );
    fireEvent.click(confirm);
    await vi.waitFor(() => expect(f.miraChoose).toHaveBeenCalledTimes(1));
    expect(f.miraChoose.mock.calls[0]![1].choice).toBe('off');
  });

  it('shows every surface busy while one of them sends a choice', async () => {
    f.miraChoose.mockReturnValue(new Promise(() => undefined));
    const hook = renderHook(
      () => ({ a: useRoomMira('m'), b: useRoomMira('m') }),
      { wrapper: Providers }
    );
    await vi.waitFor(() => expect(hook.result.current.a.data).toBeTruthy());
    act(() => {
      hook.result.current.a.choose.mutate({ choice: 'off', source: 'toggle' });
    });
    await vi.waitFor(() => expect(hook.result.current.b.choosing).toBe(true));
  });
});

describe('Mira choices over time', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('stops retrying an off once the person makes a newer choice', async () => {
    f.read.mockResolvedValue(view({ mode: 'room', session: null }));
    f.miraChoose
      .mockRejectedValueOnce(new Error('room down'))
      .mockResolvedValue(miraOn);
    const hook = renderHook(() => useRoomMira('m'), { wrapper: Providers });
    await vi.waitFor(() => expect(hook.result.current.noticeKnown).toBe(true));
    let off: Promise<unknown> | undefined;
    act(() => {
      off = hook.result.current.choose
        .mutateAsync({ choice: 'off', source: 'toggle' })
        .catch(() => undefined);
    });
    await vi.waitFor(() => expect(f.miraChoose).toHaveBeenCalledTimes(1));
    await act(() =>
      hook.result.current.choose.mutateAsync({
        choice: 'on',
        source: 'toggle',
      })
    );
    await act(() => vi.advanceTimersByTimeAsync(20_000));
    await act(async () => {
      await off;
    });
    // One failed off and the newer on; the off is never sent again.
    expect(f.miraChoose).toHaveBeenCalledTimes(2);
    expect(f.miraChoose.mock.calls[1]![1].choice).toBe('on');
    const { toast } = await import('@tuturuuu/ui/sonner');
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('keeps reading an unreadable room slowly after the backoff', async () => {
    f.read.mockRejectedValue(new Error('offline'));
    const hook = renderHook(() => useRoomMira('m'), { wrapper: Providers });
    await vi.waitFor(() => expect(f.read).toHaveBeenCalled());
    await act(() => vi.advanceTimersByTimeAsync(95_000));
    const afterBackoff = f.read.mock.calls.length;
    expect(hook.result.current.noticeKnown).toBe(false);
    await act(() => vi.advanceTimersByTimeAsync(61_000));
    expect(f.read.mock.calls.length).toBeGreaterThan(afterBackoff);
  });
});
