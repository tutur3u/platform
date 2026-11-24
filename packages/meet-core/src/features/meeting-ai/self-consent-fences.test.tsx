// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
} from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import messages from '../../../../../apps/meet/messages/en.json';

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

import { RoomMiraSelfChoice } from '../call/components/room-mira-notice';
import { useRoomMira } from '../call/components/use-room-mira';
import {
  hashMiraConsentText,
  miraConsentInfoKeys,
} from '../live-assistant/mira-consent-box';
import {
  forgetMiraJoinChoice,
  rememberMiraJoinChoice,
} from '../live-assistant/mira-join-choice';
import {
  isSelfCaptureHeld,
  resetSelfCaptureFlags,
  selfCaptureFlags,
} from './self-hold';
import { SELF_NOTICE_KEYS } from './self-notice-text';
import { TranscriptControls } from './transcript-controls';

const ai = messages.meet.ai;
const mc = messages.meet.mira_consent;
const miraText = (mode: 'room' | 'self') =>
  [
    mc.box_label,
    mc.adults,
    ...miraConsentInfoKeys(mode).map((key) => mc[key]),
  ].join('\n');
const view = (over: object = {}) => ({
  available: true,
  version: 'notice-v2',
  choice: 'allow',
  fence: { ready: false, pending: 1, declined: 1, admitted: 3 },
  active: true,
  activeSince: 1,
  mode: 'self',
  perSpeakerAvailable: true,
  canManageMode: false,
  session: { sessionId: 'session-1', protocol: 'self_v1' },
  ...over,
});
const miraOn = {
  available: true,
  version: 'v',
  acceptance: {
    revision: 1,
    acceptorName: 'Lan',
    capabilities: ['chat'],
    acceptedAt: 0,
  },
  choice: 'on',
  lastChoice: 'on',
  pausing: false,
  ready: true,
  canAccept: false,
  status: { active: true, included: 1, admitted: 2 },
  boxTickedByDefault: true,
};
const track = {
  readyState: 'live',
  getSettings: () => ({ echoCancellation: true }),
  stop: vi.fn(),
} as unknown as MediaStreamTrack;
const room = {
  localStream: { getAudioTracks: () => [track] } as unknown as MediaStream,
  connectionStatus: 'open',
  state: { participants: {} },
};
const grant = () => ({
  streamId: 'stream-1',
  consentRevision: 2,
  leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
});
const opens = () =>
  f.json.mock.calls.filter(([path]) => String(path).endsWith('/self/open'))
    .length;
const choices = () =>
  f.json.mock.calls.filter(([path]) => String(path).endsWith('/self/choice'));

function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <NextIntlClientProvider locale="en" messages={messages}>
        {children}
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}
const show = () =>
  render(
    <Providers>
      <TranscriptControls room={room} meetingId="m" wsId="w" guest={false} />
    </Providers>
  );
const speech = () => {
  for (let i = 0; i < 75; i++) f.frame?.(new Float32Array(320).fill(0.1));
  for (let i = 0; i < 200; i++) f.frame?.(new Float32Array(320));
};

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

describe('local consent fences', () => {
  it('a slow decline stops the tap before its request and nothing is sent after', async () => {
    let disposedBeforeRequest = false;
    f.json.mockImplementation((path: string) => {
      if (path.endsWith('/self/open')) return Promise.resolve(grant());
      if (path.endsWith('/self/choice')) {
        disposedBeforeRequest = f.dispose.mock.calls.length > 0;
        return new Promise(() => undefined);
      }
      return Promise.resolve({ leaseExpiresAt: grant().leaseExpiresAt });
    });
    show();
    await vi.waitFor(() => expect(f.engine).toHaveBeenCalledTimes(1));
    fireEvent.click(
      await screen.findByRole('button', { name: ai.consent_title })
    );
    fireEvent.click(
      await screen.findByRole('button', { name: ai.consent_decline })
    );
    await vi.waitFor(() => expect(choices()).toHaveLength(1));
    expect(disposedBeforeRequest).toBe(true);
    expect(isSelfCaptureHeld('m')).toBe(true);
    speech();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(f.upload).not.toHaveBeenCalled();
    expect(f.engine).toHaveBeenCalledTimes(1);
    expect(opens()).toBe(1);
  });

  it('a failed decline keeps capture stopped until an Allow succeeds', async () => {
    let allowNext = false;
    f.json.mockImplementation((path: string, init: { body: string }) => {
      if (path.endsWith('/self/open')) return Promise.resolve(grant());
      if (path.endsWith('/self/choice')) {
        const body = JSON.parse(init.body);
        if (body.choice === 'decline') return Promise.reject(new Error('down'));
        allowNext = true;
        return Promise.resolve(view());
      }
      return Promise.resolve({ leaseExpiresAt: grant().leaseExpiresAt });
    });
    show();
    await vi.waitFor(() => expect(f.engine).toHaveBeenCalledTimes(1));
    fireEvent.click(
      await screen.findByRole('button', { name: ai.consent_title })
    );
    fireEvent.click(
      await screen.findByRole('button', { name: ai.consent_decline })
    );
    await vi.waitFor(() => expect(choices()).toHaveLength(1));
    // The server still says Allow, but this device stays stopped.
    expect(await screen.findByText(ai.self_untick)).toBeTruthy();
    expect(f.dispose).toHaveBeenCalledTimes(1);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(opens()).toBe(1);
    // The decline can be tried again.
    expect(
      screen.getByRole('button', { name: ai.consent_decline })
    ).toBeTruthy();
    fireEvent.click(
      await screen.findByRole('button', { name: ai.consent_allow })
    );
    await vi.waitFor(() => expect(allowNext).toBe(true));
    await vi.waitFor(() => expect(opens()).toBe(2));
    expect(isSelfCaptureHeld('m')).toBe(false);
  });

  it('an Allow carries the notice version, locale and the hash of the text shown', async () => {
    f.read.mockResolvedValue(view({ choice: null }));
    f.json.mockImplementation((path: string) =>
      Promise.resolve(path.endsWith('/self/choice') ? view() : grant())
    );
    show();
    fireEvent.click(
      await screen.findByRole('button', { name: ai.consent_allow })
    );
    await vi.waitFor(() => expect(choices()).toHaveLength(1));
    const body = JSON.parse(choices()[0]![1].body);
    const shown = SELF_NOTICE_KEYS.map((key) => ai[key]).join('\n');
    expect(body).toEqual({
      choice: 'allow',
      noticeVersion: 'notice-v2',
      locale: 'en',
      textHash: await hashMiraConsentText(shown),
    });
    expect(f.legacyChoice).not.toHaveBeenCalled();
  });

  it('pagehide aborts the upload in flight and stores nothing', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    let signal: AbortSignal | undefined;
    f.upload.mockImplementation(
      (
        _ws: string,
        _m: string,
        _data: FormData,
        _o: unknown,
        s: AbortSignal
      ) => {
        signal = s;
        return new Promise(() => undefined);
      }
    );
    f.json.mockImplementation((path: string) =>
      Promise.resolve(
        path.endsWith('/self/open')
          ? grant()
          : { leaseExpiresAt: grant().leaseExpiresAt }
      )
    );
    show();
    await vi.waitFor(() => expect(f.engine).toHaveBeenCalledTimes(1));
    speech();
    await vi.waitFor(() => expect(f.upload).toHaveBeenCalledTimes(1));
    window.dispatchEvent(new Event('pagehide'));
    expect(signal?.aborted).toBe(true);
    expect(f.dispose).toHaveBeenCalledTimes(1);
    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });
});

const conflict = (code: string) =>
  Object.assign(new Error(code), { status: 409, code });

describe('server notice and eligibility answers', () => {
  it('asks for the per-speaker notice after a room-mode Allow, then captures', async () => {
    // Allowed while the room used room capture: the server has no
    // per-speaker notice evidence for that Allow.
    let noticeConfirmed = false;
    f.json.mockImplementation((path: string) => {
      if (path.endsWith('/self/open'))
        return noticeConfirmed
          ? Promise.resolve(grant())
          : Promise.reject(conflict('MEET_SELF_NOTICE_REQUIRED'));
      if (path.endsWith('/self/choice')) {
        noticeConfirmed = true;
        return Promise.resolve(view());
      }
      return Promise.resolve({ leaseExpiresAt: grant().leaseExpiresAt });
    });
    show();
    // The notice opens on its own with the per-speaker text and an Allow.
    expect(await screen.findByText(ai.self_notice)).toBeTruthy();
    const allow = await screen.findByRole('button', { name: ai.consent_allow });
    expect(f.engine).not.toHaveBeenCalled();
    // Nothing is allowed on the person's behalf.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(choices()).toHaveLength(0);
    expect(opens()).toBe(1);
    fireEvent.click(allow);
    await vi.waitFor(() => expect(choices()).toHaveLength(1));
    expect(JSON.parse(choices()[0]![1].body).choice).toBe('allow');
    await vi.waitFor(() => expect(opens()).toBe(2));
    await vi.waitFor(() => expect(f.engine).toHaveBeenCalledTimes(1));
  });

  it('a decline answers the per-speaker notice without lifting the hold', async () => {
    f.json.mockImplementation((path: string) => {
      if (path.endsWith('/self/open'))
        return Promise.reject(conflict('MEET_SELF_NOTICE_REQUIRED'));
      if (path.endsWith('/self/choice'))
        return Promise.resolve(view({ choice: 'decline' }));
      return Promise.resolve({ leaseExpiresAt: grant().leaseExpiresAt });
    });
    show();
    const decline = await screen.findByRole('button', {
      name: ai.consent_decline,
    });
    fireEvent.click(decline);
    await vi.waitFor(() => expect(choices()).toHaveLength(1));
    await vi.waitFor(() =>
      expect(selfCaptureFlags('m').noticeRequired).toBe(false)
    );
    // The person reads as declined, not as undecided, and stays held.
    fireEvent.click(screen.getByRole('button', { name: ai.consent_title }));
    expect(await screen.findByText(ai.self_untick)).toBeTruthy();
    expect(isSelfCaptureHeld('m')).toBe(true);
    expect(opens()).toBe(1);
  });

  it('stops asking a signed-in non-member who cannot contribute', async () => {
    f.read.mockResolvedValue(view({ choice: null }));
    f.json.mockImplementation((path: string) =>
      path.endsWith('/self/choice')
        ? Promise.reject(conflict('MEET_SELF_NOT_ELIGIBLE'))
        : Promise.resolve(grant())
    );
    const { toast } = await import('@tuturuuu/ui/sonner');
    show();
    fireEvent.click(
      await screen.findByRole('button', { name: ai.consent_allow })
    );
    await vi.waitFor(() => expect(choices()).toHaveLength(1));
    await vi.waitFor(() =>
      expect(
        screen.queryByRole('button', { name: ai.consent_allow })
      ).toBeNull()
    );
    expect(toast.error).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: ai.consent_title }));
    expect(await screen.findByText(ai.self_state_guest)).toBeTruthy();
    expect(screen.queryByRole('button', { name: ai.consent_allow })).toBeNull();
    expect(
      screen.queryByRole('button', { name: ai.consent_decline })
    ).toBeNull();
  });

  it('reads the current notice again when the shown one is stale', async () => {
    f.read.mockResolvedValue(view({ choice: null }));
    f.json.mockImplementation((path: string) =>
      path.endsWith('/self/choice')
        ? Promise.reject(conflict('MEET_SELF_NOTICE_STALE'))
        : Promise.resolve(grant())
    );
    show();
    const allow = await screen.findByRole('button', { name: ai.consent_allow });
    const reads = f.read.mock.calls.length;
    fireEvent.click(allow);
    await vi.waitFor(() =>
      expect(f.read.mock.calls.length).toBeGreaterThan(reads)
    );
  });
});

describe('Mira and the per-speaker transcript', () => {
  const mira = () => renderHook(() => useRoomMira('m'), { wrapper: Providers });

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
    f.miraChoose.mockRejectedValue(conflict('MEET_MIRA_NOTICE_MODE_MISMATCH'));
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
    const confirm = await screen.findByRole('button', { name: mc.confirm });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    expect(
      screen
        .getByRole('checkbox', { name: mc.box_label })
        .hasAttribute('disabled')
    ).toBe(true);
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
