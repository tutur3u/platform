// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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

import { hashMiraConsentText } from '../live-assistant/mira-consent-box';
import { forgetMiraJoinChoice } from '../live-assistant/mira-join-choice';
import {
  ai,
  conflict,
  grant,
  miraOn,
  Providers,
  room,
  view,
} from './self-fences.fixtures';
import {
  isSelfCaptureHeld,
  resetSelfCaptureFlags,
  selfCaptureFlags,
} from './self-hold';
import { SELF_NOTICE_KEYS } from './self-notice-text';
import { TranscriptControls } from './transcript-controls';

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
