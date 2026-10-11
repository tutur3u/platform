// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import messages from '../../../messages/en.json';
import { RecentSessions } from './recent-sessions';

vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) =>
    messages.parley[key as keyof typeof messages.parley],
}));
vi.mock(
  '@tuturuuu/meet-core/features/call/components/meeting-local-time',
  () => ({ MeetingLocalTime: () => null })
);
afterEach(cleanup);
it('offers the latest three review destinations without displaying a global count', async () => {
  const sessions = Array.from({ length: 4 }, (_, index) => ({
    id: `session-${index}`,
    scenarioId: 'scenario',
    title: `Practice ${index}`,
    category: 'Team',
    createdAt: '2026-10-01',
    revision: 1,
    briefing: '',
    roleCount: 0,
  }));
  render(await RecentSessions({ sessions }));
  expect(
    screen.getByRole('link', { name: /Practice 0/ }).getAttribute('href')
  ).toBe('/sessions/session-0');
  expect(screen.queryByText('Practice 3')).toBeNull();
  expect(
    screen.getByRole('link', { name: 'View all sessions' }).getAttribute('href')
  ).toBe('/sessions');
});
it('distinguishes an unavailable archive from an empty archive', async () => {
  render(await RecentSessions({ sessions: null }));
  expect(
    screen.getByText(messages.parley.recent_sessions_unavailable)
  ).toBeTruthy();
  expect(screen.queryByText(messages.parley.sessions_empty)).toBeNull();
});
