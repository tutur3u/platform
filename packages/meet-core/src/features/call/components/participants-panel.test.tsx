// @vitest-environment jsdom
import type { MeetRealtimePresence } from '@tuturuuu/realtime/meet';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';
import { ParticipantsPanel } from './participants-panel';

afterEach(cleanup);

it('keeps the join request glyph outside the accordion chevron rotation', () => {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ParticipantsPanel
        approved={[]}
        canManage
        onDecideAdmission={vi.fn()}
        onForget={vi.fn()}
        onMute={vi.fn()}
        onRemove={vi.fn()}
        onShareNotes={vi.fn()}
        participants={[]}
        raisedHandUserIds={[]}
        selfUserId="host"
        shareNotes={false}
        waiting={[
          {
            userId: 'guest',
            displayName: 'Guest',
            requestedAt: '2026-01-01T00:00:00Z',
          },
        ]}
      />
    </NextIntlClientProvider>
  );
  const trigger = screen.getByRole('button', { name: /Join requests\s*1/ });
  const icon = trigger.querySelector('svg.lucide-user-round-plus');
  expect(icon).not.toBeNull();
  expect(icon?.closest('[aria-hidden="true"]')).not.toBeNull();
  expect(icon?.parentElement).not.toBe(trigger);
  expect(trigger.querySelectorAll(':scope > svg')).toHaveLength(1);
  expect(trigger.getAttribute('aria-expanded')).toBe('true');
  fireEvent.click(trigger);
  expect(trigger.getAttribute('aria-expanded')).toBe('false');
});

it('hides the microphone badge in a presence-only room and keeps the name', () => {
  const person = {
    userId: 'self',
    displayName: 'Ada',
    media: { audioEnabled: false, videoEnabled: false, screenEnabled: false },
  } as MeetRealtimePresence;
  const props = {
    approved: [],
    canManage: false,
    onDecideAdmission: vi.fn(),
    onForget: vi.fn(),
    onMute: vi.fn(),
    onRemove: vi.fn(),
    onShareNotes: vi.fn(),
    participants: [person],
    raisedHandUserIds: ['self'],
    selfUserId: 'self',
    shareNotes: false,
    waiting: [],
  };
  const { rerender } = render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ParticipantsPanel {...props} settings={{ transport: 'media' }} />
    </NextIntlClientProvider>
  );
  expect(screen.getByText('Ada')).toBeTruthy();
  expect(screen.getByText('Microphone muted')).toBeTruthy();
  rerender(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ParticipantsPanel {...props} settings={{ transport: 'presence' }} />
    </NextIntlClientProvider>
  );
  expect(screen.getByText('Ada')).toBeTruthy();
  expect(screen.queryByText('Microphone muted')).toBeNull();
});
