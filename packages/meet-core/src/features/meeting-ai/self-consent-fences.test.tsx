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

import { useRoomMira } from '../call/components/use-room-mira';
import { hashMiraConsentText } from '../live-assistant/mira-consent-box';
import { isSelfCaptureHeld, releaseSelfCapture } from './self-hold';
import { SELF_NOTICE_KEYS } from './self-notice-text';
import { TranscriptControls } from './transcript-controls';

const ai = messages.meet.ai;
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
  releaseSelfCapture('m');
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
    await act(() =>
      hook.result.current.choose.mutateAsync({ choice: 'on', source: 'toggle' })
    );
    expect(f.legacyChoice).not.toHaveBeenCalled();
  });
});
