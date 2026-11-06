import type { ReactElement, ReactNode } from 'react';
import { beforeEach, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  section: vi.fn(() => null),
  ended: vi.fn(() => null),
}));
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock('@tuturuuu/meet-core/features/call/components/call-ended', () => ({
  CallEnded: mocks.ended,
}));
vi.mock(
  '@tuturuuu/meet-core/features/call/components/device-session-gate',
  () => ({ CallShell: () => null })
);
vi.mock(
  '@tuturuuu/meet-core/features/call/components/participant-name-form',
  () => ({ ParticipantNameForm: () => null })
);
vi.mock('@tuturuuu/ui/hooks/use-workspace-visibility', () => ({
  WorkspaceVisibilityProvider: ({ children }: { children: ReactNode }) =>
    children,
}));
vi.mock('@/features/meeting-notes/meeting-notes-section', () => ({
  MeetingNotesSection: mocks.section,
}));
vi.mock('./public-invite-view', () => ({ MeetingPublicInvite: () => null }));

import { RoomView } from './room-view';

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
function model(policy: Record<string, unknown>, isHost = false) {
  return {
    kind: 'room',
    access: {
      meeting: { id: meetingId, name: 'Weekly sync', ws_id: 'ws-1' },
      user: { id: 'viewer-id' },
      isHost,
      canReadWorkspace: true,
      workspaceSlug: 'personal',
    },
    policy,
    initialShowNotes: true,
  } as unknown as Parameters<typeof RoomView>[0]['model'];
}

beforeEach(() => vi.clearAllMocks());

test('the in-room ended screen opens the notes and transcript tabs', () => {
  const policy = { ended: true, canReadNotes: true };
  const [ended] = findByType(RoomView({ model: model(policy) }), mocks.ended);
  const props = ended?.props as { notes?: ReactElement };
  expect(props.notes?.type).toBe(mocks.section);
  expect(props.notes?.props).toEqual({
    wsId: 'ws-1',
    meetingId,
    title: 'Weekly sync',
    isHost: false,
    policy,
    sharingControl: false,
  });
});

test('the in-room ended screen keeps the reader gate on the policy', () => {
  const policy = { ended: true, canReadNotes: false };
  const [ended] = findByType(RoomView({ model: model(policy) }), mocks.ended);
  expect(ended?.props).toMatchObject({ canReadNotes: false });
});
