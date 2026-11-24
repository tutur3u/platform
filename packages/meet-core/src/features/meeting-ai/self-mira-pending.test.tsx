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
import { forgetMiraJoinChoice } from '../live-assistant/mira-join-choice';
import { mc, miraOn, Providers, view } from './self-fences.fixtures';
import { resetSelfCaptureFlags } from './self-hold';

const off = { ...miraOn, choice: null, lastChoice: null };
const show = () =>
  render(
    <Providers>
      <RoomMiraSelfChoice meetingId="m" />
    </Providers>
  );
const expired = () =>
  Object.assign(new Error('expired'), {
    status: 503,
    code: 'MIRA_ROOM_PENDING_EXPIRED',
  });

beforeEach(() => {
  vi.resetAllMocks();
  resetSelfCaptureFlags('m');
  forgetMiraJoinChoice('m');
  f.read.mockResolvedValue(view({ mode: 'room', session: null }));
  f.mira.mockResolvedValue(off);
  f.legacyChoice.mockResolvedValue({});
});
afterEach(cleanup);

describe('a Mira on that is not yet in effect', () => {
  it('shows turning on while the request is in flight and on only after the 200', async () => {
    let finish!: (value: unknown) => void;
    f.miraChoose.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    show();
    const confirm = await screen.findByRole('button', { name: mc.confirm });
    await vi.waitFor(() =>
      expect((confirm as HTMLButtonElement).disabled).toBe(false)
    );
    fireEvent.click(confirm);
    expect(await screen.findByText(mc.turning_on)).toBeTruthy();
    expect(screen.queryByText(mc.you_on)).toBeNull();
    finish(miraOn);
    expect(await screen.findByText(mc.you_on)).toBeTruthy();
    expect(screen.queryByText(mc.turning_on)).toBeNull();
  });

  it('shows turning on while the room reports a staged on', async () => {
    f.mira.mockResolvedValue({ ...off, pending: true });
    show();
    expect(await screen.findByText(mc.turning_on)).toBeTruthy();
    expect(screen.queryByText(mc.you_on)).toBeNull();
    expect(screen.queryByRole('button', { name: mc.confirm })).toBeNull();
  });

  it('lets the request in flight decide when the room drops the staged on', async () => {
    let finish!: (value: unknown) => void;
    f.miraChoose.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    show();
    const confirm = await screen.findByRole('button', { name: mc.confirm });
    await vi.waitFor(() =>
      expect((confirm as HTMLButtonElement).disabled).toBe(false)
    );
    fireEvent.click(confirm);
    await screen.findByText(mc.turning_on);
    // The room restarted and reports nothing staged; the request is still out.
    f.mira.mockResolvedValue({ ...off, pending: false });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.getByText(mc.turning_on)).toBeTruthy();
    finish(miraOn);
    expect(await screen.findByText(mc.you_on)).toBeTruthy();
  });

  it('returns to the previous state on an expired staged on, without retrying', async () => {
    f.miraChoose.mockRejectedValue(expired());
    const { toast } = await import('@tuturuuu/ui/sonner');
    show();
    const confirm = await screen.findByRole('button', { name: mc.confirm });
    await vi.waitFor(() =>
      expect((confirm as HTMLButtonElement).disabled).toBe(false)
    );
    const reads = f.mira.mock.calls.length;
    fireEvent.click(confirm);
    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    await vi.waitFor(() =>
      expect(f.mira.mock.calls.length).toBeGreaterThan(reads)
    );
    // The person sees the choice they had before, and can try again.
    expect(
      await screen.findByRole('button', { name: mc.confirm })
    ).toBeTruthy();
    expect(screen.queryByText(mc.turning_on)).toBeNull();
    expect(screen.queryByText(mc.you_on)).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(f.miraChoose).toHaveBeenCalledTimes(1);
  });
});
