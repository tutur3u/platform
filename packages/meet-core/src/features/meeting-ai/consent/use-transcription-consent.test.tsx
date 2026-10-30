// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MEET_CONSENT_NOTICE_VERSION } from './notice';

const mocks = vi.hoisted(() => ({
  own: vi.fn(),
  roster: vi.fn(),
  record: vi.fn(),
  opened: [] as boolean[],
}));
vi.mock('@tuturuuu/internal-api', () => ({
  getMeetAiConsents: mocks.roster,
  getMeetAiOwnConsent: mocks.own,
  recordMeetAiConsent: mocks.record,
}));
vi.mock('./consent-dialog', () => ({
  TranscriptionConsentDialog: ({
    open,
    onOpenChange,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
  }) => {
    mocks.opened.push(open);
    return (
      <button type="button" onClick={() => onOpenChange(false)}>
        close
      </button>
    );
  },
}));
vi.mock('./transcription-pill', () => ({ TranscriptionPill: () => null }));
vi.mock('./transcription-cues', () => ({ useTranscriptionCues: () => {} }));

import { TranscriptionLayer } from './transcription-layer';
import { useTranscriptionConsent } from './use-transcription-consent';

const session = '00000000-0000-4000-8000-0000000000aa';
const me = '00000000-0000-4000-8000-000000000002';
const host = '00000000-0000-4000-8000-000000000001';

function room(consents: Record<string, boolean>) {
  return {
    state: {
      selfUserId: me,
      role: 'participant',
      participants: {},
      transcription: {
        state: {
          active: true,
          sessionId: session,
          startedBy: host,
          language: 'auto',
          consentRequired: true,
        },
        consents,
      },
    },
    connectionStatus: 'open',
    announceTranscription: vi.fn(),
    sendTranscriptionConsent: vi.fn(),
  } as never;
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.opened.length = 0;
});

describe('participant consent across a notice change', () => {
  it('keeps an allow recorded under the current notice', async () => {
    mocks.own.mockResolvedValue({
      available: true,
      noticeVersion: MEET_CONSENT_NOTICE_VERSION,
      decision: 'allow',
    });
    const { result } = renderHook(
      () =>
        useTranscriptionConsent({
          wsId: host,
          meetingId: host,
          room: room({ [me]: true }),
        }),
      { wrapper }
    );
    await waitFor(() => expect(mocks.own).toHaveBeenCalled());
    expect(result.current.selfDecision).toBe(true);
    expect(result.current.outdated).toBe(false);
  });

  it('asks an already-allowed participant again when the server notice changed', async () => {
    // The room still mirrors true from before the bump; the record is stale.
    mocks.own.mockResolvedValue({
      available: true,
      noticeVersion: 'meet-transcription-v9-future',
      decision: null,
    });
    const { result } = renderHook(
      () =>
        useTranscriptionConsent({
          wsId: host,
          meetingId: host,
          room: room({ [me]: true }),
        }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.selfDecision).toBeUndefined());
    // This bundle still carries the old notice, so it must reload to decide.
    expect(result.current.outdated).toBe(true);
    expect(result.current.noticeVersion).toBe('meet-transcription-v9-future');
  });

  it('reopens a prompt deferred under the old notice when the notice changes', () => {
    const consent = (noticeVersion: string) =>
      ({
        active: true,
        isStarter: false,
        selfDecision: undefined,
        sessionId: session,
        startedBy: host,
        noticeVersion,
      }) as never;
    const props = { room: room({}), onOpenRoster: () => {} };
    const view = render(
      <TranscriptionLayer consent={consent('v4')} {...props} />
    );
    expect(mocks.opened.at(-1)).toBe(true);
    view.getByText('close').click();
    view.rerender(<TranscriptionLayer consent={consent('v4')} {...props} />);
    expect(mocks.opened.at(-1)).toBe(false);
    view.rerender(<TranscriptionLayer consent={consent('v5')} {...props} />);
    expect(mocks.opened.at(-1)).toBe(true);
  });
});
