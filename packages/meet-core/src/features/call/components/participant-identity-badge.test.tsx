// @vitest-environment jsdom
import type {
  MeetRealtimePresence,
  MeetRealtimeWaitingParticipant,
} from '@tuturuuu/realtime/meet';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import en from '../../../../../../apps/meet/messages/en.json';
import vi_ from '../../../../../../apps/meet/messages/vi.json';
import parleyEn from '../../../../../../apps/parley/messages/en.json';
import parleyVi from '../../../../../../apps/parley/messages/vi.json';
import {
  meetParticipantIdentity,
  meetParticipantName,
} from '../lib/participant-identity';
import { ChatAuthor } from './chat-author';
import { ParticipantIdentityBadge } from './participant-identity-badge';
import { ParticipantsPanel } from './participants-panel';

afterEach(cleanup);

const media = { audioEnabled: true, videoEnabled: false, screenEnabled: false };

function person(patch: Partial<MeetRealtimePresence>) {
  return {
    userId: 'person',
    displayName: 'Person',
    joinedAt: '2026-11-24T03:00:00.000Z',
    lastSeenAt: '2026-11-24T03:00:00.000Z',
    media,
    role: 'speaker',
    ...patch,
  } as MeetRealtimePresence;
}

describe('meetParticipantIdentity', () => {
  it.each([
    [{}, 'member'],
    [{ external: true }, 'external'],
    [{ guest: true }, 'guest'],
    [{ guest: true, external: true }, 'guest'],
  ] as const)('%j is %s', (flags, identity) => {
    expect(meetParticipantIdentity(flags)).toBe(identity);
  });

  it('ignores the display name, so a chosen name cannot forge a marker', () => {
    expect(meetParticipantIdentity({})).toBe('member');
  });

  it('strips the legacy suffix only when a flag carries the marker', () => {
    expect(meetParticipantName('Lan (guest)', { external: true })).toBe('Lan');
    expect(meetParticipantName('Lan (guest)', { guest: true })).toBe('Lan');
    // A room without the flags keeps the suffix so the person stays marked.
    expect(meetParticipantName('Lan (guest)', {})).toBe('Lan (guest)');
    expect(meetParticipantName('Lan', { external: true })).toBe('Lan');
  });
});

describe('ParticipantIdentityBadge', () => {
  const renderBadge = (
    participant: Parameters<typeof ParticipantIdentityBadge>[0]['participant'],
    locale = 'en'
  ) =>
    render(
      <NextIntlClientProvider
        locale={locale}
        messages={locale === 'vi' ? vi_ : en}
      >
        <ParticipantIdentityBadge participant={participant} />
      </NextIntlClientProvider>
    );

  it('renders nothing for workspace members', () => {
    const view = renderBadge({});
    expect(view.container.innerHTML).toBe('');
  });

  it('names anonymous guests and outside accounts in both locales', () => {
    renderBadge({ guest: true });
    expect(
      screen.getByRole('button', { name: 'Guest, not signed in' })
    ).toBeTruthy();
    cleanup();
    renderBadge({ external: true });
    expect(
      screen.getByRole('button', { name: 'From outside this workspace' })
    ).toBeTruthy();
    cleanup();
    renderBadge({ external: true }, 'vi');
    expect(
      screen.getByRole('button', { name: 'Ngoài không gian làm việc này' })
    ).toBeTruthy();
  });

  it('opens the tooltip on keyboard focus and toggles it on tap', () => {
    renderBadge({ external: true });
    const trigger = screen.getByRole('button', {
      name: 'From outside this workspace',
    });
    expect(trigger.getAttribute('title')).toBeNull();
    expect(trigger.querySelector('svg')?.getAttribute('aria-hidden')).toBe(
      'true'
    );
    fireEvent.focus(trigger);
    expect(screen.getByRole('tooltip').textContent).toBe(
      'From outside this workspace'
    );
    fireEvent.blur(trigger);
    expect(screen.queryByRole('tooltip')).toBeNull();
    const tap = () => {
      fireEvent.pointerDown(trigger, { pointerType: 'touch' });
      fireEvent.click(trigger);
    };
    tap();
    expect(screen.getByRole('tooltip')).toBeTruthy();
    // Radix closes on pointerdown; the second tap must stay closed.
    tap();
    expect(screen.queryByRole('tooltip')).toBeNull();
    tap();
    expect(screen.getByRole('tooltip')).toBeTruthy();
  });

  it('ships the copy in every Meet and Parley bundle', () => {
    for (const bundle of [en, vi_, parleyEn, parleyVi]) {
      const copy = bundle.meet.call.participant_identity;
      expect(copy.guest.length).toBeGreaterThan(0);
      expect(copy.external.length).toBeGreaterThan(0);
    }
  });
});

describe('ParticipantsPanel identity markers', () => {
  const renderPanel = (
    participants: MeetRealtimePresence[],
    waiting: MeetRealtimeWaitingParticipant[] = []
  ) =>
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <ParticipantsPanel
          approved={[]}
          canManage
          onDecideAdmission={vi.fn()}
          onForget={vi.fn()}
          onMute={vi.fn()}
          onRemove={vi.fn()}
          participants={participants}
          raisedHandUserIds={[]}
          selfUserId="host"
          waiting={waiting}
        />
      </NextIntlClientProvider>
    );

  it('marks an admitted outside account without calling it a guest', () => {
    renderPanel([
      person({ userId: 'outside', displayName: 'Free QA', external: true }),
    ]);
    expect(screen.getByText('Free QA')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'From outside this workspace' })
    ).toBeTruthy();
    expect(screen.queryByText(/guest/i)).toBeNull();
  });

  it('keeps an icon marker for anonymous guests and none for members', () => {
    renderPanel([
      person({ userId: 'anon', displayName: 'Lan', guest: true }),
      person({ userId: 'member', displayName: 'Minh' }),
    ]);
    expect(
      screen.getAllByRole('button', { name: 'Guest, not signed in' })
    ).toHaveLength(1);
    expect(
      screen.queryByRole('button', { name: 'From outside this workspace' })
    ).toBeNull();
  });

  it('strips a legacy " (guest)" suffix from waiting and admitted names', () => {
    renderPanel(
      [
        person({
          userId: 'old',
          displayName: 'Old Name (guest)',
          external: true,
        }),
      ],
      [
        {
          userId: 'waiting',
          displayName: 'Waiting Name (guest)',
          external: true,
          requestedAt: '2026-11-24T03:00:00.000Z',
        },
      ]
    );
    expect(screen.getByText('Old Name')).toBeTruthy();
    expect(screen.getByText('Waiting Name')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Admit: Waiting Name' })
    ).toBeTruthy();
    expect(screen.queryByText(/\(guest\)/)).toBeNull();
  });
});

describe('ChatAuthor', () => {
  const message = {
    body: 'hi',
    createdAt: '2026-11-24T03:00:00.000Z',
    displayName: 'Free QA',
    id: 'm1',
    userId: 'gone',
  };
  const renderAuthor = (
    patch: Partial<typeof message> & { external?: true; guest?: true },
    participants?: { userId: string; external?: boolean; guest?: boolean }[]
  ) =>
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <ChatAuthor
          message={{ ...message, ...patch }}
          participants={participants}
          self={false}
          youLabel="You"
        />
      </NextIntlClientProvider>
    );

  it('keeps the marker from the message after the author leaves', () => {
    renderAuthor({ external: true }, []);
    expect(screen.getByText('Free QA')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'From outside this workspace' })
    ).toBeTruthy();
  });

  it('falls back to presence for messages without flags', () => {
    renderAuthor({ displayName: 'Lan (guest)' }, [
      { userId: 'gone', guest: true },
    ]);
    expect(screen.getByText('Lan')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Guest, not signed in' })
    ).toBeTruthy();
  });
});
