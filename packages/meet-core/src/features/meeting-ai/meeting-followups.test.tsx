// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import type { MeetAiSession } from '@tuturuuu/internal-api';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';
import messages from '../../../../../apps/meet/messages/en.json';
import { MeetingFollowups } from './meeting-followups';

vi.mock('./followup-review', () => ({ FollowupReview: () => null }));
afterEach(cleanup);

it('preserves different owners and dates while removing exact duplicate suggestions', () => {
  const task = { task: 'Send report', owner: 'Alex', dueDate: 'Tomorrow' };
  const event = {
    title: 'Design review',
    evidence: 'Review the design',
    timeText: null,
    startLocal: '2026-09-16T09:00',
    endLocal: '2026-09-16T10:00',
    timezone: 'Asia/Ho_Chi_Minh',
  };
  const session: MeetAiSession = {
    id: 'session',
    user_id: 'host',
    created_at: '2026-09-15T00:00:00Z',
    ended_at: null,
    notes_started_at: null,
    notes_status: 'completed',
    notes_cost_usd: null,
    notes: {
      incomplete: false,
      summary: '',
      decisions: [],
      openQuestions: [],
      actionItems: [
        task,
        task,
        { ...task, owner: 'Sam' },
        { ...task, dueDate: 'Friday' },
      ],
      calendarSuggestions: [
        event,
        event,
        {
          ...event,
          startLocal: '2026-09-17T09:00',
          endLocal: '2026-09-17T10:00',
        },
      ],
    },
  };
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <MeetingFollowups
        session={session}
        meetingId="meeting"
        wsId="workspace"
      />
    </NextIntlClientProvider>
  );
  expect(screen.getAllByText('Send report')).toHaveLength(3);
  expect(screen.getAllByText('Design review')).toHaveLength(2);
  expect(screen.getByText('Sam · Tomorrow')).toBeTruthy();
  expect(screen.getByText('Alex · Friday')).toBeTruthy();
});
