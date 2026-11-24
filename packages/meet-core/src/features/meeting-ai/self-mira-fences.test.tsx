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
  dispose: vi.fn(),
  frame: null as null | ((frame: Float32Array) => void),
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

import {
  RoomMiraNotice,
  RoomMiraSelfChoice,
} from '../call/components/room-mira-notice';
import { useRoomMira } from '../call/components/use-room-mira';
import { hashMiraConsentText } from '../live-assistant/mira-consent-box';
import {
  forgetMiraJoinChoice,
  rememberMiraJoinChoice,
} from '../live-assistant/mira-join-choice';
import {
  ai,
  conflict,
  grant,
  mc,
  miraOn,
  miraText,
  Providers,
  room,
  view,
} from './self-fences.fixtures';
import { isSelfCaptureHeld, resetSelfCaptureFlags } from './self-hold';
import { TranscriptControls } from './transcript-controls';

const mira = () => renderHook(() => useRoomMira('m'), { wrapper: Providers });
const opens = () =>
  f.json.mock.calls.filter(([path]) => String(path).endsWith('/self/open'))
    .length;
const choices = () =>
  f.json.mock.calls.filter(([path]) => String(path).endsWith('/self/choice'));
const show = () =>
  render(
    <Providers>
      <TranscriptControls room={room} meetingId="m" wsId="w" guest={false} />
    </Providers>
  );

beforeEach(() => {
  vi.resetAllMocks();
  resetSelfCaptureFlags('m');
  forgetMiraJoinChoice('m');
  f.read.mockResolvedValue(view());
  f.mira.mockResolvedValue(miraOn);
  f.upload.mockResolvedValue({});
  f.engine.mockImplementation(async (_track, onFrame) => {
    f.frame = onFrame;
    return { swapTrack: vi.fn(), dispose: f.dispose };
  });
});
afterEach(cleanup);

describe('Mira and the per-speaker transcript', () => {
  it('Mira off holds capture before its request is sent', async () => {
    let heldAtRequest = false;
    f.miraChoose.mockImplementation(() => {
      heldAtRequest = isSelfCaptureHeld('m');
      return Promise.resolve({ ...miraOn, choice: 'off' });
    });
    const hook = mira();
    await vi.waitFor(() => expect(hook.result.current.data).toBeTruthy());
    await act(() =>
      hook.result.current.choose.mutateAsync({
        choice: 'off',
        source: 'toggle',
      })
    );
    expect(heldAtRequest).toBe(true);
    expect(isSelfCaptureHeld('m')).toBe(true);
  });

  it('Mira on never records a transcript Allow in a per-speaker meeting', async () => {
    f.miraChoose.mockResolvedValue(miraOn);
    const hook = mira();
    await vi.waitFor(() => expect(hook.result.current.data).toBeTruthy());
    await act(() =>
      hook.result.current.choose.mutateAsync({ choice: 'on', source: 'toggle' })
    );
    expect(f.legacyChoice).not.toHaveBeenCalled();
  });

  it('hashes the per-speaker Mira notice and says so in a per-speaker meeting', async () => {
    f.miraChoose.mockResolvedValue({ ...miraOn, choice: 'off' });
    const hook = mira();
    await vi.waitFor(() => expect(hook.result.current.noticeMode).toBe('self'));
    await act(() =>
      hook.result.current.choose.mutateAsync({
        choice: 'off',
        source: 'toggle',
      })
    );
    const sent = f.miraChoose.mock.calls[0]![1];
    expect(sent.noticeMode).toBe('self');
    expect(sent.textHash).toBe(await hashMiraConsentText(miraText('self')));
  });

  it('keeps the room-capture Mira payload as it was', async () => {
    f.read.mockResolvedValue(view({ mode: 'room', session: null }));
    f.miraChoose.mockResolvedValue({ ...miraOn, choice: 'off' });
    const hook = mira();
    await vi.waitFor(() => expect(hook.result.current.data).toBeTruthy());
    await vi.waitFor(() => expect(f.read).toHaveBeenCalled());
    await act(() =>
      hook.result.current.choose.mutateAsync({
        choice: 'off',
        source: 'toggle',
      })
    );
    const sent = f.miraChoose.mock.calls[0]![1];
    expect('noticeMode' in sent).toBe(false);
    expect(sent.textHash).toBe(await hashMiraConsentText(miraText('room')));
  });

  it('asks to confirm instead of applying a join choice in a per-speaker meeting', async () => {
    rememberMiraJoinChoice('m', {
      ticked: true,
      textHash: 'a'.repeat(64),
      locale: 'en',
      seenRevision: 1,
      noticeMode: 'room',
    });
    f.mira.mockResolvedValue({ ...miraOn, choice: null, lastChoice: null });
    f.miraChoose.mockResolvedValue(miraOn);
    const hook = mira();
    await vi.waitFor(() => expect(hook.result.current.noticeMode).toBe('self'));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(f.miraChoose).not.toHaveBeenCalled();
  });

  it('still applies a join choice in a room-capture meeting', async () => {
    rememberMiraJoinChoice('m', {
      ticked: true,
      textHash: 'a'.repeat(64),
      locale: 'en',
      seenRevision: 1,
      noticeMode: 'room',
    });
    f.read.mockResolvedValue(view({ mode: 'room', session: null }));
    f.mira.mockResolvedValue({ ...miraOn, choice: null, lastChoice: null });
    f.miraChoose.mockResolvedValue(miraOn);
    mira();
    await vi.waitFor(() =>
      expect(f.miraChoose).toHaveBeenCalledWith(
        'm',
        expect.objectContaining({ source: 'join', textHash: 'a'.repeat(64) })
      )
    );
  });

  it('treats an unreadable room as unknown and keeps the join state pending', async () => {
    rememberMiraJoinChoice('m', {
      ticked: true,
      textHash: 'a'.repeat(64),
      locale: 'en',
      seenRevision: 1,
      noticeMode: 'room',
    });
    f.read.mockRejectedValueOnce(new Error('offline'));
    f.read.mockResolvedValue(view({ mode: 'room', session: null }));
    f.mira.mockResolvedValue({ ...miraOn, choice: null, lastChoice: null });
    f.miraChoose.mockResolvedValue(miraOn);
    const hook = mira();
    await vi.waitFor(() => expect(hook.result.current.data).toBeTruthy());
    await vi.waitFor(() => expect(f.read).toHaveBeenCalledTimes(1));
    expect(hook.result.current.noticeKnown).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(f.miraChoose).not.toHaveBeenCalled();
    // The read is retried; once it succeeds the join state applies.
    await vi.waitFor(
      () =>
        expect(f.miraChoose).toHaveBeenCalledWith(
          'm',
          expect.objectContaining({ source: 'join' })
        ),
      { timeout: 5000 }
    );
    expect(hook.result.current.noticeKnown).toBe(true);
  });

  it('never turns Mira on under an unknown notice, but always lets it off', async () => {
    f.read.mockRejectedValue(new Error('offline'));
    f.miraChoose.mockResolvedValue({ ...miraOn, choice: 'off' });
    const hook = mira();
    await vi.waitFor(() => expect(hook.result.current.data).toBeTruthy());
    await act(async () => {
      await expect(
        hook.result.current.choose.mutateAsync({
          choice: 'on',
          source: 'toggle',
        })
      ).rejects.toThrow();
    });
    expect(f.miraChoose).not.toHaveBeenCalled();
    await act(() =>
      hook.result.current.choose.mutateAsync({
        choice: 'off',
        source: 'toggle',
      })
    );
    expect(f.miraChoose).toHaveBeenCalledTimes(1);
    expect('noticeMode' in f.miraChoose.mock.calls[0]![1]).toBe(false);
  });

  it('asks again after the server expects another notice, without resending', async () => {
    f.miraChoose.mockRejectedValue(conflict('MIRA_ROOM_NOTICE_MODE_STALE'));
    const hook = mira();
    await vi.waitFor(() => expect(hook.result.current.noticeKnown).toBe(true));
    const reads = f.read.mock.calls.length;
    const miraReads = f.mira.mock.calls.length;
    await act(async () => {
      await expect(
        hook.result.current.choose.mutateAsync({
          choice: 'on',
          source: 'toggle',
        })
      ).rejects.toBeTruthy();
    });
    await vi.waitFor(() => {
      expect(f.read.mock.calls.length).toBeGreaterThan(reads);
      expect(f.mira.mock.calls.length).toBeGreaterThan(miraReads);
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(f.miraChoose).toHaveBeenCalledTimes(1);
  });

  it('holds the confirm box until the meeting notice is known', async () => {
    let settle!: (value: unknown) => void;
    f.read.mockReturnValue(new Promise((resolve) => (settle = resolve)));
    f.mira.mockResolvedValue({ ...miraOn, choice: null, lastChoice: null });
    render(
      <Providers>
        <RoomMiraSelfChoice meetingId="m" />
      </Providers>
    );
    // Ticked (the default here), it cannot turn Mira on yet; the box itself
    // stays usable so an untick can always be recorded.
    const confirm = await screen.findByRole('button', { name: mc.confirm });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    expect(
      screen
        .getByRole('checkbox', { name: mc.box_label })
        .hasAttribute('disabled')
    ).toBe(false);
    settle(view());
    await vi.waitFor(() =>
      expect((confirm as HTMLButtonElement).disabled).toBe(false)
    );
    // The meeting is per-speaker, so the box now carries that notice.
    fireEvent.click(screen.getByRole('button', { name: mc.info_button }));
    expect(await screen.findByText(mc.info_off_self)).toBeTruthy();
  });

  it('Mira on still allows the room-capture transcript', async () => {
    f.read.mockResolvedValue(view({ mode: 'room', session: null }));
    f.miraChoose.mockResolvedValue(miraOn);
    f.legacyChoice.mockResolvedValue({});
    const hook = mira();
    await vi.waitFor(() => expect(hook.result.current.data).toBeTruthy());
    await act(() =>
      hook.result.current.choose.mutateAsync({ choice: 'on', source: 'toggle' })
    );
    expect(f.legacyChoice).toHaveBeenCalledWith(
      'm',
      'allow',
      expect.any(String)
    );
  });

  it('never records an Allow when the room state cannot be read', async () => {
    f.read.mockRejectedValue(new Error('offline'));
    f.miraChoose.mockResolvedValue(miraOn);
    const hook = mira();
    await vi.waitFor(() => expect(hook.result.current.data).toBeTruthy());
    // Mira itself is not turned on under an unknown notice.
    await act(async () => {
      await expect(
        hook.result.current.choose.mutateAsync({
          choice: 'on',
          source: 'toggle',
        })
      ).rejects.toThrow();
    });
    expect(f.miraChoose).not.toHaveBeenCalled();
    expect(f.legacyChoice).not.toHaveBeenCalled();
  });

  it('applies a join untick even while the meeting notice is unknown', async () => {
    rememberMiraJoinChoice('m', {
      ticked: false,
      textHash: 'a'.repeat(64),
      locale: 'en',
      seenRevision: 1,
      noticeMode: 'room',
    });
    f.read.mockRejectedValue(new Error('offline'));
    f.mira.mockResolvedValue({ ...miraOn, choice: null, lastChoice: null });
    f.miraChoose.mockResolvedValue({ ...miraOn, choice: 'off' });
    mira();
    await vi.waitFor(() =>
      expect(f.miraChoose).toHaveBeenCalledWith(
        'm',
        expect.objectContaining({ choice: 'off', source: 'join' })
      )
    );
  });
});

describe('Mira re-confirmation after a capture mode change', () => {
  const header = () =>
    render(
      <Providers>
        <RoomMiraNotice meetingId="m" />
      </Providers>
    );
  const staleOn = (noticeMode: 'room' | 'self') => ({
    ...miraOn,
    noticeMode,
    noticeStale: true,
  });

  it('asks again under the per-speaker notice after room to self, never on its own', async () => {
    f.mira.mockResolvedValue(staleOn('self'));
    f.miraChoose.mockResolvedValue({ ...miraOn, noticeMode: 'self' });
    header();
    // The prompt opens itself, with the reason above the per-speaker box.
    expect(await screen.findByText(/each person's device/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: mc.info_button }));
    expect(await screen.findByText(mc.info_off_self)).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(f.miraChoose).not.toHaveBeenCalled();
    // A re-confirmation for a new scope starts unticked.
    const box = screen.getByRole('checkbox', { name: mc.box_label });
    expect(box.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(box);
    fireEvent.click(screen.getByRole('button', { name: mc.confirm }));
    await vi.waitFor(() => expect(f.miraChoose).toHaveBeenCalledTimes(1));
    const sent = f.miraChoose.mock.calls[0]![1];
    expect(sent).toMatchObject({
      choice: 'on',
      source: 'confirm',
      noticeMode: 'self',
    });
    // The reason line is explanatory only: the hash is the plain notice.
    expect(sent.textHash).toBe(await hashMiraConsentText(miraText('self')));
  });

  it('asks again under the room notice after self to room, never on its own', async () => {
    f.read.mockResolvedValue(view({ mode: 'room', session: null }));
    f.mira.mockResolvedValue(staleOn('room'));
    f.miraChoose.mockResolvedValue({ ...miraOn, noticeMode: 'room' });
    header();
    expect(await screen.findByText(/one shared transcript/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: mc.info_button }));
    expect(await screen.findByText(mc.info_off)).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(f.miraChoose).not.toHaveBeenCalled();
    // A re-confirmation for a new scope starts unticked.
    const box = screen.getByRole('checkbox', { name: mc.box_label });
    expect(box.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(box);
    fireEvent.click(screen.getByRole('button', { name: mc.confirm }));
    await vi.waitFor(() => expect(f.miraChoose).toHaveBeenCalledTimes(1));
    const sent = f.miraChoose.mock.calls[0]![1];
    expect(sent).toMatchObject({ choice: 'on', source: 'confirm' });
    expect('noticeMode' in sent).toBe(false);
    expect(sent.textHash).toBe(await hashMiraConsentText(miraText('room')));
  });

  it('shows no prompt or reason while the on matches the current notice', async () => {
    f.mira.mockResolvedValue({
      ...miraOn,
      noticeMode: 'self',
      noticeStale: false,
    });
    render(
      <Providers>
        <RoomMiraSelfChoice meetingId="m" />
      </Providers>
    );
    expect(await screen.findByText(mc.you_on)).toBeTruthy();
    expect(screen.queryByRole('button', { name: mc.confirm })).toBeNull();
    expect(screen.queryByText(/each person's device/)).toBeNull();
  });

  it('reads both again on a stale-notice refusal and resends nothing', async () => {
    f.mira.mockResolvedValue(staleOn('self'));
    f.miraChoose.mockRejectedValue(conflict('MIRA_ROOM_NOTICE_MODE_STALE'));
    const hook = mira();
    await vi.waitFor(() => expect(hook.result.current.noticeStale).toBe(true));
    const reads = f.read.mock.calls.length;
    const miraReads = f.mira.mock.calls.length;
    await act(async () => {
      await expect(
        hook.result.current.choose.mutateAsync({
          choice: 'on',
          source: 'confirm',
        })
      ).rejects.toBeTruthy();
    });
    await vi.waitFor(() => {
      expect(f.read.mock.calls.length).toBeGreaterThan(reads);
      expect(f.mira.mock.calls.length).toBeGreaterThan(miraReads);
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(f.miraChoose).toHaveBeenCalledTimes(1);
  });

  it('never captures under an on given for the other notice', async () => {
    f.mira.mockResolvedValue(staleOn('self'));
    f.json.mockImplementation(() => Promise.resolve(grant()));
    show();
    await vi.waitFor(() => expect(f.mira).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(opens()).toBe(0);
    expect(f.engine).not.toHaveBeenCalled();
  });

  it('sends no transcript Allow under a stale Mira on until Mira is confirmed again', async () => {
    f.read.mockResolvedValue(view({ choice: null }));
    f.mira.mockResolvedValue(staleOn('self'));
    f.miraChoose.mockResolvedValue({
      ...miraOn,
      noticeMode: 'self',
      noticeStale: false,
    });
    f.json.mockImplementation((path: string) =>
      Promise.resolve(path.endsWith('/self/choice') ? view() : grant())
    );
    show();
    // The transcript notice asks for Mira first and offers no Allow yet.
    const confirm = await screen.findByRole('button', { name: mc.confirm });
    expect(screen.queryByRole('button', { name: ai.consent_allow })).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(choices()).toHaveLength(0);
    expect(f.legacyChoice).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('checkbox', { name: mc.box_label }));
    fireEvent.click(confirm);
    await vi.waitFor(() => expect(f.miraChoose).toHaveBeenCalledTimes(1));
    expect(f.miraChoose.mock.calls[0]![1]).toMatchObject({
      choice: 'on',
      noticeMode: 'self',
    });
    // Only now is the Allow offered, and only the person sends it.
    const allow = await screen.findByRole('button', { name: ai.consent_allow });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(choices()).toHaveLength(0);
    fireEvent.click(allow);
    await vi.waitFor(() => expect(choices()).toHaveLength(1));
    expect(f.miraChoose.mock.invocationCallOrder[0]).toBeLessThan(
      f.json.mock.invocationCallOrder[
        f.json.mock.calls.findIndex(([path]) =>
          String(path).endsWith('/self/choice')
        )
      ]!
    );
  });
});

describe('a failed Mira off', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('is retried until the room records it, with capture held throughout', async () => {
    f.miraChoose
      .mockRejectedValueOnce(new Error('room down'))
      .mockRejectedValueOnce(new Error('room down'))
      .mockResolvedValue({ ...miraOn, choice: 'off' });
    const hook = mira();
    await vi.waitFor(() => expect(hook.result.current.data).toBeTruthy());
    let done: Promise<unknown> | undefined;
    act(() => {
      done = hook.result.current.choose.mutateAsync({
        choice: 'off',
        source: 'toggle',
      });
    });
    await vi.waitFor(() => expect(f.miraChoose).toHaveBeenCalledTimes(1));
    expect(isSelfCaptureHeld('m')).toBe(true);
    await act(() => vi.advanceTimersByTimeAsync(15_000));
    await act(async () => {
      await done;
    });
    expect(f.miraChoose).toHaveBeenCalledTimes(3);
    const { toast } = await import('@tuturuuu/ui/sonner');
    expect(toast.error).not.toHaveBeenCalled();
    expect(isSelfCaptureHeld('m')).toBe(true);
  });

  it('stops after three tries, says so and shows the room state', async () => {
    f.miraChoose.mockRejectedValue(new Error('room down'));
    const hook = mira();
    await vi.waitFor(() => expect(hook.result.current.data).toBeTruthy());
    const reads = f.mira.mock.calls.length;
    let done: Promise<unknown> | undefined;
    act(() => {
      done = hook.result.current.choose
        .mutateAsync({ choice: 'off', source: 'toggle' })
        .catch(() => undefined);
    });
    await act(() => vi.advanceTimersByTimeAsync(20_000));
    await act(async () => {
      await done;
    });
    expect(f.miraChoose).toHaveBeenCalledTimes(3);
    const { toast } = await import('@tuturuuu/ui/sonner');
    expect(toast.error).toHaveBeenCalledTimes(1);
    await vi.waitFor(() =>
      expect(f.mira.mock.calls.length).toBeGreaterThan(reads)
    );
    expect(isSelfCaptureHeld('m')).toBe(true);
  });

  it('never retries an on', async () => {
    f.read.mockResolvedValue(view({ mode: 'room', session: null }));
    f.miraChoose.mockRejectedValue(new Error('room down'));
    const hook = mira();
    await vi.waitFor(() => expect(hook.result.current.noticeKnown).toBe(true));
    let done: Promise<unknown> | undefined;
    act(() => {
      done = hook.result.current.choose
        .mutateAsync({ choice: 'on', source: 'toggle' })
        .catch(() => undefined);
    });
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    await act(async () => {
      await done;
    });
    expect(f.miraChoose).toHaveBeenCalledTimes(1);
  });
});
