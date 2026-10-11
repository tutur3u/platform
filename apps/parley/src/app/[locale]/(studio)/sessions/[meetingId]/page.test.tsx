// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import messages from '../../../../../../messages/en.json';
import Review from './page';

const f = vi.hoisted(() => ({
  user: vi.fn(),
  notes: vi.fn(),
  access: vi.fn(),
  scenario: vi.fn(),
}));
vi.mock('next/server', () => ({ connection: vi.fn() }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('not found');
  },
}));
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) =>
    messages.parley[key as keyof typeof messages.parley] ?? key,
}));
vi.mock('@tuturuuu/meet-core/parley/authorization', () => ({
  requireParleyUser: f.user,
}));
vi.mock('@tuturuuu/meet-core/parley/repository', () => ({
  getFacilitatorNotes: f.notes,
  getSessionScenario: f.scenario,
}));
vi.mock('@tuturuuu/meet-core/features/call/lib/call-access', () => ({
  getMeetCallAccess: f.access,
}));
vi.mock(
  '@tuturuuu/meet-core/features/call/components/meeting-local-time',
  () => ({ MeetingLocalTime: () => null })
);
vi.mock('@tuturuuu/meet-core/features/meeting-ai/meeting-ai-overview', () => ({
  MeetingAiOverview: () => null,
}));
vi.mock('@/features/studio/research-notes', () => ({
  ResearchNotes: () => null,
}));
vi.mock('@/features/studio/session-invitation', () => ({
  SessionInvitation: () => null,
}));
const meetingId = '11111111-1111-4111-8111-111111111111';
const props = {
  params: Promise.resolve({ meetingId }),
  searchParams: Promise.resolve({}),
};
beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('MEET_APP_URL', 'https://parley.tuturuuu.com');
  vi.stubEnv('NEXT_PUBLIC_MEET_APP_URL', '');
  f.user.mockResolvedValue({ id: 'facilitator' });
  f.notes.mockResolvedValue({
    total: 0,
    decisions: 0,
    notes: [],
    hasMore: false,
  });
  f.access.mockResolvedValue({ isHost: true, meeting: { ws_id: 'workspace' } });
  f.scenario.mockResolvedValue({
    title: 'Saved scenario',
    category: 'Team',
    createdAt: '2026-10-01',
    revision: 1,
    roles: [],
    rubric: 'Private saved rubric',
    instructions: 'Hidden AI instructions',
    briefing: 'Public briefing',
  });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});
it('denies non-owners before reading private scenario data', async () => {
  f.notes.mockResolvedValue(null);
  await expect(Review(props)).rejects.toThrow('not found');
  expect(f.notes).toHaveBeenCalledWith(meetingId, 'facilitator', 0);
  expect(f.access).not.toHaveBeenCalled();
  expect(f.scenario).not.toHaveBeenCalled();
});
it('denies a non-host before reading the private snapshot', async () => {
  f.access.mockResolvedValue({ isHost: false });
  await expect(Review(props)).rejects.toThrow('not found');
  expect(f.scenario).not.toHaveBeenCalled();
});
it('renders the saved rubric for the facilitator and links the exact meeting to Meet', async () => {
  render(await Review(props));
  expect(screen.getByText('Private saved rubric')).toBeTruthy();
  expect(screen.queryByText('Hidden AI instructions')).toBeNull();
  expect(
    screen
      .getByRole('link', { name: 'Meeting details in Meet' })
      .getAttribute('href')
  ).toBe(`https://meet.tuturuuu.com/workspace/meetings/${meetingId}`);
});
it('omits an empty rubric', async () => {
  const scenario = await f.scenario();
  f.scenario.mockResolvedValue({ ...scenario, rubric: '' });
  render(await Review(props));
  expect(
    screen.queryByRole('heading', { name: 'Facilitator debrief guide' })
  ).toBeNull();
});
