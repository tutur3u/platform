// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import messages from '../../../../../apps/meet/messages/en.json';

const f = vi.hoisted(() => ({
  read: vi.fn(),
  choose: vi.fn(),
  mira: vi.fn(),
  json: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api', () => ({
  readMeetTranscriptConsent: f.read,
  setMeetTranscriptChoice: f.choose,
  readRoomMiraConsent: f.mira,
  setRoomMiraChoice: vi.fn(),
  acceptRoomMira: vi.fn(),
  turnOffRoomMira: vi.fn(),
  reportRoomMiraMinor: vi.fn(),
  getInternalApiClient: () => ({ json: f.json }),
  uploadMeetAiChunk: vi.fn(),
  InternalApiError: class extends Error {},
}));
vi.mock('@tuturuuu/ui/sonner', () => ({ toast: { error: vi.fn() } }));

import { CaptureModeMenu } from './capture-mode-menu';
import { CaptureModePicker } from './capture-mode-picker';
import { SelfCaptureStatus } from './self-capture-status';
import { SelfCoverage } from './self-coverage';
import type { SelfCaptureState } from './self-lifecycle';
import {
  holdSelfCapture,
  requireSelfNotice,
  resetSelfCaptureFlags,
} from './self-hold';
import { ROOM_ONLY, type SelfRoomView } from './self-room';
import { TranscriptConsentNotice } from './transcript-consent-notice';

const ai = messages.meet.ai;
const wrap = (node: ReactNode) =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <NextIntlClientProvider locale="en" messages={messages}>
        {node}
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
const room = (over: Partial<SelfRoomView> = {}): SelfRoomView => ({
  ...ROOM_ONLY,
  available: true,
  canManageMode: true,
  ...over,
});

beforeEach(() => {
  vi.resetAllMocks();
  f.mira.mockResolvedValue({ available: false });
  resetSelfCaptureFlags('m');
});
afterEach(cleanup);

describe('participant capture states', () => {
  const cases: Array<[SelfCaptureState['kind'], string]> = [
    ['off', ai.self_state_off],
    ['capturing', ai.self_state_capturing],
    ['paused', ai.self_state_paused],
    ['unsupported', ai.self_state_unsupported],
    ['guest', ai.self_state_guest],
    ['app', ai.self_state_app],
    ['stopped', ai.self_state_stopped],
  ];
  it.each(cases)('says %s in one sentence', (kind, text) => {
    wrap(<SelfCaptureStatus state={{ kind } as SelfCaptureState} />);
    expect(screen.getByRole('status').textContent).toBe(text);
  });
});

describe('capture mode picker', () => {
  it('is hidden unless the server offers per-speaker capture to a manager', () => {
    wrap(
      <>
        <CaptureModePicker
          wsId="w"
          meetingId="m"
          room={room({ available: false })}
        />
        <CaptureModePicker
          wsId="w"
          meetingId="m"
          room={room({ canManageMode: false })}
        />
        <CaptureModePicker wsId="w" meetingId="m" room={ROOM_ONLY} />
      </>
    );
    expect(screen.queryByText(ai.self_mode_title)).toBeNull();
  });

  it('switches the mode through the Meet server', async () => {
    f.json.mockResolvedValue({ mode: 'self' });
    wrap(<CaptureModePicker wsId="w" meetingId="m" room={room()} />);
    fireEvent.click(screen.getByRole('radio', { name: ai.self_mode_self }));
    await vi.waitFor(() => expect(f.json).toHaveBeenCalled());
    expect(f.json.mock.calls[0]![0]).toBe('/api/meet-ai/w/m/self/mode');
    expect(JSON.parse(f.json.mock.calls[0]![1].body)).toEqual({ mode: 'self' });
  });

  it('is locked while a session is running', () => {
    wrap(
      <CaptureModePicker
        wsId="w"
        meetingId="m"
        room={room({
          mode: 'self',
          session: { sessionId: 's', protocol: 'self_v1' },
        })}
      />
    );
    expect(
      (
        screen.getByRole('radio', {
          name: ai.self_mode_room,
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
    expect(screen.getByText(ai.self_mode_locked)).toBeTruthy();
  });
});

describe('coverage', () => {
  it('shows only contributing or not contributing, never why', () => {
    wrap(
      <SelfCoverage
        coverage={[
          { accountId: 'a', contributing: true },
          { accountId: 'b', contributing: false },
        ]}
        names={{ a: 'Lan', b: 'Minh' }}
      />
    );
    const rows = screen.getAllByRole('listitem').map((row) => row.textContent);
    expect(rows).toEqual([
      `Lan${ai.self_coverage_yes}`,
      `Minh${ai.self_coverage_no}`,
    ]);
  });
});

describe('per-speaker consent notice', () => {
  const view = (over: object = {}) => ({
    available: true,
    version: 'v1',
    choice: null,
    fence: { ready: false, pending: 2, declined: 0, admitted: 3 },
    active: true,
    activeSince: 1,
    mode: 'self',
    perSpeakerAvailable: true,
    canManageMode: false,
    session: { sessionId: 's', protocol: 'self_v1' },
    ...over,
  });

  it('replaces the all-or-nothing wording with the per-speaker notice', async () => {
    f.read.mockResolvedValue(view());
    wrap(
      <TranscriptConsentNotice
        meetingId="m"
        wsId="w"
        capture={{ kind: 'off' }}
      />
    );
    expect(await screen.findByText(ai.self_notice)).toBeTruthy();
    expect(screen.queryByText(ai.consent_body)).toBeNull();
    expect(screen.queryByText(ai.consent_readers)).toBeNull();
    expect(screen.queryByText(/Waiting for/)).toBeNull();
    expect(screen.getByRole('status').textContent).toBe(ai.self_state_off);
  });

  it('tells a participant who declined that others keep their transcript', async () => {
    f.read.mockResolvedValue(view({ choice: 'decline' }));
    wrap(
      <TranscriptConsentNotice
        meetingId="m"
        wsId="w"
        capture={{ kind: 'off' }}
      />
    );
    fireEvent.click(
      await screen.findByRole('button', { name: ai.consent_title })
    );
    expect(await screen.findByText(ai.self_untick)).toBeTruthy();
    expect(screen.queryByText(ai.consent_you_declined)).toBeNull();
  });

  it('keeps room capture wording and the fence in room mode', async () => {
    f.read.mockResolvedValue(view({ mode: 'room', session: null }));
    wrap(<TranscriptConsentNotice meetingId="m" wsId="w" />);
    expect(await screen.findByText(ai.consent_body)).toBeTruthy();
    expect(screen.queryByText(ai.self_notice)).toBeNull();
  });

  it('records the choice through the per-speaker route', async () => {
    f.read.mockResolvedValue(view());
    f.json.mockResolvedValue({ ...view({ choice: 'decline' }) });
    wrap(
      <TranscriptConsentNotice
        meetingId="m"
        wsId="w"
        capture={{ kind: 'off' }}
      />
    );
    fireEvent.click(
      await screen.findByRole('button', { name: ai.consent_decline })
    );
    await vi.waitFor(() => expect(f.json).toHaveBeenCalled());
    expect(f.json.mock.calls[0]![0]).toBe('/api/meet-ai/w/m/self/choice');
    expect(f.choose).not.toHaveBeenCalled();
  });

  it('shows the host only contributing or not contributing', async () => {
    f.read.mockResolvedValue(
      view({
        canManageMode: true,
        coverage: [
          { accountId: 'a', contributing: true },
          { accountId: 'b', contributing: false },
        ],
      })
    );
    wrap(
      <TranscriptConsentNotice
        meetingId="m"
        wsId="w"
        capture={{ kind: 'capturing' }}
        names={{ a: 'Lan', b: 'Minh' }}
      />
    );
    expect(await screen.findByText(ai.self_coverage_no)).toBeTruthy();
    expect(screen.getByText('Minh')).toBeTruthy();
  });
});

describe('per-speaker header', () => {
  const view = (over: object = {}) => ({
    available: true,
    version: 'v1',
    choice: 'allow',
    fence: { ready: false, pending: 2, declined: 1, admitted: 3 },
    active: true,
    activeSince: 1,
    mode: 'self',
    perSpeakerAvailable: true,
    canManageMode: false,
    session: { sessionId: 's', protocol: 'self_v1' },
    ...over,
  });
  const indicator = async () =>
    (await screen.findByRole('button', { name: ai.consent_title })).textContent;

  it('shows the indicator live while the session runs, whatever my own state', async () => {
    f.read.mockResolvedValue(view());
    wrap(
      <TranscriptConsentNotice
        meetingId="m"
        wsId="w"
        capture={{ kind: 'unsupported' }}
      />
    );
    expect(await indicator()).toBe(ai.indicator_live);
  });

  it('shows a guest only that they cannot contribute', async () => {
    f.read.mockResolvedValue(view({ choice: null }));
    f.mira.mockResolvedValue({
      available: true,
      version: 'v',
      acceptance: {
        revision: 1,
        acceptorName: 'Lan',
        capabilities: ['chat'],
        acceptedAt: 0,
      },
      choice: null,
      lastChoice: null,
      pausing: false,
      ready: false,
      canAccept: false,
      status: { active: true, included: 1, admitted: 2 },
      boxTickedByDefault: true,
    });
    wrap(
      <TranscriptConsentNotice
        meetingId="m"
        wsId="w"
        guest
        capture={{ kind: 'off' }}
      />
    );
    fireEvent.click(
      await screen.findByRole('button', { name: ai.consent_title })
    );
    expect(await screen.findByText(ai.self_state_guest)).toBeTruthy();
    expect(screen.queryByRole('button', { name: ai.consent_allow })).toBeNull();
    expect(screen.queryByText(ai.consent_mira_off)).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('hides Decline from guests in a per-speaker meeting only', async () => {
    f.read.mockResolvedValue(view());
    const { unmount } = wrap(
      <TranscriptConsentNotice
        meetingId="m"
        wsId="w"
        guest
        capture={{ kind: 'guest' }}
      />
    );
    fireEvent.click(
      await screen.findByRole('button', { name: ai.consent_title })
    );
    await screen.findByText(ai.self_state_guest);
    expect(
      screen.queryByRole('button', { name: ai.consent_decline })
    ).toBeNull();
    unmount();
    f.read.mockResolvedValue(view({ mode: 'room', session: null }));
    wrap(<TranscriptConsentNotice meetingId="m" wsId="w" guest />);
    fireEvent.click(
      await screen.findByRole('button', { name: ai.consent_title })
    );
    expect(
      await screen.findByRole('button', { name: ai.consent_decline })
    ).toBeTruthy();
  });

  it('opens again when a new question comes up after it was closed', async () => {
    f.read.mockResolvedValue(view());
    wrap(
      <TranscriptConsentNotice
        meetingId="m"
        wsId="w"
        capture={{ kind: 'off' }}
      />
    );
    const trigger = await screen.findByRole('button', {
      name: ai.consent_title,
    });
    fireEvent.click(trigger);
    await screen.findByText(ai.self_notice);
    fireEvent.click(trigger);
    await vi.waitFor(() =>
      expect(screen.queryByText(ai.self_notice)).toBeNull()
    );
    act(() => requireSelfNotice('m'));
    expect(await screen.findByText(ai.self_notice)).toBeTruthy();
    expect(screen.getByRole('button', { name: ai.consent_allow })).toBeTruthy();
  });

  it('reads as declined and offers Allow while a local decline is held', async () => {
    f.read.mockResolvedValue(view());
    holdSelfCapture('m');
    wrap(
      <TranscriptConsentNotice
        meetingId="m"
        wsId="w"
        capture={{ kind: 'off' }}
      />
    );
    fireEvent.click(
      await screen.findByRole('button', { name: ai.consent_title })
    );
    expect(await screen.findByText(ai.self_untick)).toBeTruthy();
    expect(screen.getByRole('button', { name: ai.consent_allow })).toBeTruthy();
  });

  it('gives managers the locked capture mode in the notice', async () => {
    f.read.mockResolvedValue(view({ canManageMode: true }));
    wrap(
      <TranscriptConsentNotice
        meetingId="m"
        wsId="w"
        capture={{ kind: 'off' }}
      />
    );
    fireEvent.click(
      await screen.findByRole('button', { name: ai.consent_title })
    );
    const radio = await screen.findByRole('radio', { name: ai.self_mode_self });
    expect((radio as HTMLButtonElement).disabled).toBe(true);
  });

  it('gives every manager a header entry to the mode before a session', async () => {
    f.json.mockResolvedValue({ mode: 'self' });
    wrap(
      <CaptureModeMenu
        wsId="w"
        meetingId="m"
        room={room({ mode: 'room', session: null })}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: ai.self_mode_title }));
    fireEvent.click(
      await screen.findByRole('radio', { name: ai.self_mode_self })
    );
    await vi.waitFor(() =>
      expect(f.json.mock.calls[0]![0]).toBe('/api/meet-ai/w/m/self/mode')
    );
  });

  it('has no header entry for people who cannot manage the mode', () => {
    wrap(
      <CaptureModeMenu
        wsId="w"
        meetingId="m"
        room={room({ canManageMode: false })}
      />
    );
    expect(
      screen.queryByRole('button', { name: ai.self_mode_title })
    ).toBeNull();
  });

  it('labels a contributor without a known name generically', () => {
    wrap(
      <SelfCoverage
        coverage={[{ accountId: 'x', contributing: true }]}
        names={{}}
      />
    );
    expect(screen.getByRole('listitem').textContent).toBe(
      `${ai.self_coverage_unnamed}${ai.self_coverage_yes}`
    );
  });
});
