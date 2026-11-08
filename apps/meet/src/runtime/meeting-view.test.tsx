import type { ReactElement, ReactNode } from 'react';
import { beforeEach, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  section: vi.fn(() => null),
  ended: vi.fn(() => null),
}));
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock('next/link', () => ({ default: () => null }));
vi.mock('@tuturuuu/ui/button', () => ({ Button: () => null }));
vi.mock('@tuturuuu/ui/card', () => ({
  Card: () => null,
  CardContent: () => null,
  CardDescription: () => null,
  CardHeader: () => null,
  CardTitle: () => null,
}));
vi.mock('@/constants/common', () => ({
  CALENDAR_URL: 'https://calendar.example.test',
}));
vi.mock('@/features/call/components/call-ended', () => ({
  CallEnded: mocks.ended,
}));
vi.mock('@/features/call/components/meeting-local-time', () => ({
  MeetingLocalTime: () => null,
}));
vi.mock('@/features/call/components/meeting-public-settings', () => ({
  MeetingPublicSettings: () => null,
}));
vi.mock('@/features/meeting-ai/meeting-ai-overview', () => {
  throw new Error('the runtime meeting view must not load the old overview');
});
vi.mock('@/features/meeting-notes/meeting-notes-section', () => ({
  MeetingNotesSection: mocks.section,
}));
vi.mock('../app/[locale]/[wsId]/meetings/[meetingId]/meeting-actions', () => ({
  MeetingActions: () => null,
}));
vi.mock(
  '../app/[locale]/[wsId]/meetings/[meetingId]/recording-sessions-overview',
  () => ({ RecordingSessionsOverview: () => null })
);
vi.mock('./meeting-duration-view', () => ({ MeetingDurationInfo: () => null }));

import { MeetingView } from './meeting-view';

function findByType(node: ReactNode, type: unknown): ReactElement[] {
  if (Array.isArray(node)) return node.flatMap((n) => findByType(n, type));
  if (!node || typeof node !== 'object' || !('props' in node)) return [];
  const element = node as ReactElement<{ children?: ReactNode }>;
  return [
    ...(element.type === type ? [element] : []),
    ...findByType(element.props.children, type),
  ];
}

const meetingId = '10000000-0000-4000-8000-000000000001';
function model(detail: Record<string, unknown>) {
  return {
    kind: 'meeting',
    workspace: {
      user: { id: 'viewer-id' },
      workspaceSlug: 'personal',
      wsId: 'canonical-workspace',
    },
    detail: {
      meeting: {
        id: meetingId,
        name: null,
        time: '2026-10-05T10:00:00Z',
        created_at: '2026-10-05T09:00:00Z',
        creator: { display_name: 'Host' },
      },
      isHost: false,
      ...detail,
    },
  } as unknown as Parameters<typeof MeetingView>[0]['model'];
}
const sectionProps = (policy: unknown) => ({
  wsId: 'canonical-workspace',
  meetingId,
  title: 'untitled_meeting',
  isHost: false,
  policy,
});

beforeEach(() => vi.clearAllMocks());

test('active meetings render the shared notes and transcript section', () => {
  const policy = {
    ended: false,
    canReadNotes: true,
    settings: { shareNotes: true },
  };
  const view = MeetingView({
    model: model({
      kind: 'active',
      policy,
      calendarEvent: null,
      durationSeconds: 3600,
    }),
  });
  const [section] = findByType(view, mocks.section);
  expect(section?.props).toEqual(sectionProps(policy));
});

test('ended meetings open the notes and transcript tabs inside the ended screen', () => {
  const policy = { ended: true, canReadNotes: true, settings: {} };
  const view = MeetingView({ model: model({ kind: 'ended', policy }) });
  expect(view.type).toBe(mocks.ended);
  expect(view.props.initialShowNotes).toBe(true);
  expect(view.props.notes.type).toBe(mocks.section);
  expect(view.props.notes.props).toEqual({
    ...sectionProps(policy),
    sharingControl: false,
  });
});

test('ended meetings keep notes closed for viewers the policy denies', () => {
  const policy = { ended: true, canReadNotes: false };
  const view = MeetingView({ model: model({ kind: 'ended', policy }) });
  expect(view.props.canReadNotes).toBe(false);
  expect(view.props.initialShowNotes).toBe(false);
});
