// @vitest-environment jsdom
import type { MeetRealtimePresence } from '@tuturuuu/realtime/meet';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import enMessages from '../../../../../../apps/meet/messages/en.json';
import viMessages from '../../../../../../apps/meet/messages/vi.json';
import { liveQaTool } from '../tools/live-activities/qa/definition';
import { pollsTool } from '../tools/polls';
import { PresenceStage } from './presence-stage';

afterEach(cleanup);

const PARTICIPANTS: readonly MeetRealtimePresence[] = [
  {
    userId: 'u-self',
    displayName: 'You',
    role: 'host',
    joinedAt: '2026-11-27T00:00:00.000Z',
    lastSeenAt: '2026-11-27T00:00:00.000Z',
    media: { audioEnabled: false, videoEnabled: false, screenEnabled: false },
  },
  {
    userId: 'u-minh',
    displayName: 'Minh Nguyen',
    role: 'speaker',
    joinedAt: '2026-11-27T00:00:00.000Z',
    lastSeenAt: '2026-11-27T00:00:00.000Z',
    media: { audioEnabled: false, videoEnabled: false, screenEnabled: false },
  },
];

describe('PresenceStage live activity highlight', () => {
  it('highlights active and host-enabled activities with presence and one-tap join', () => {
    const open = vi.fn();
    render(
      <NuqsTestingAdapter>
        <NextIntlClientProvider locale="en" messages={enMessages} timeZone="UTC">
          <PresenceStage
            stage={{ open, openIds: [] }}
            canBrowse
            participants={PARTICIPANTS}
            selfUserId="u-self"
            raisedHandUserIds={[]}
            tools={{
              tools: [liveQaTool, pollsTool],
              openToolIds: [],
              onTool: vi.fn(),
            }}
            navigationAllowed
            defaultActivity="tool:polls"
            presenceByActivity={{
              'tool:live-qa': [
                { userId: 'u-minh', displayName: 'Minh Nguyen' },
              ],
            }}
          />
        </NextIntlClientProvider>
      </NuqsTestingAdapter>
    );

    expect(screen.getByTestId('presence-live-activities')).toBeTruthy();
    expect(screen.getByText('Live now')).toBeTruthy();
    expect(screen.getByText('1 active')).toBeTruthy();
    expect(screen.getByText('Host enabled')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Join Q&A' }));
    expect(open).toHaveBeenCalledWith('tool:live-qa');

    fireEvent.click(screen.getByRole('button', { name: 'Join Polls' }));
    expect(open).toHaveBeenCalledWith('tool:polls');
  });

  it('respects permissions by omitting join action on restricted activities', () => {
    const open = vi.fn();
    render(
      <NuqsTestingAdapter>
        <NextIntlClientProvider locale="en" messages={enMessages} timeZone="UTC">
          <PresenceStage
            stage={{ open, openIds: [] }}
            canBrowse={false}
            participants={PARTICIPANTS}
            selfUserId="u-self"
            raisedHandUserIds={[]}
            tools={{
              tools: [],
              openToolIds: [],
              onTool: vi.fn(),
            }}
            navigationAllowed={false}
            defaultActivity="tool:polls"
            isAvailable={(id) => id === 'tool:polls'}
            presenceByActivity={{
              document: [{ userId: 'u-minh', displayName: 'Minh Nguyen' }],
            }}
          />
        </NextIntlClientProvider>
      </NuqsTestingAdapter>
    );

    expect(
      screen.queryByRole('button', { name: 'Join Shared document' })
    ).toBeNull();
    expect(screen.getByRole('button', { name: 'Join Polls' })).toBeTruthy();
  });

  it('renders localized Vietnamese copy without English side-by-side leakage', () => {
    render(
      <NuqsTestingAdapter>
        <NextIntlClientProvider locale="vi" messages={viMessages} timeZone="UTC">
          <PresenceStage
            stage={{ open: vi.fn(), openIds: [] }}
            canBrowse
            participants={PARTICIPANTS}
            selfUserId="u-self"
            raisedHandUserIds={[]}
            tools={{
              tools: [liveQaTool, pollsTool],
              openToolIds: [],
              onTool: vi.fn(),
            }}
            navigationAllowed
            defaultActivity="tool:polls"
            presenceByActivity={{
              'tool:live-qa': [
                { userId: 'u-minh', displayName: 'Minh Nguyen' },
              ],
            }}
          />
        </NextIntlClientProvider>
      </NuqsTestingAdapter>
    );

    const text = document.body.textContent ?? '';
    expect(text).toContain('Đang diễn ra');
    expect(text).toContain('Chủ phòng đã bật');
    expect(text).toContain('Tham gia');
    expect(text).not.toContain('Live now');
    expect(text).not.toContain('Host enabled');
    expect(text).not.toContain('More activities');
  });
});
