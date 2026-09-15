import { expect, it, vi } from 'vitest';

vi.mock('@tuturuuu/internal-api', () => ({
  createWorkspaceTask: vi.fn(),
  createWorkspaceCalendarEvent: vi.fn(),
}));

import { buildFollowupPayload, type FollowupSaveInput } from './followup-save';

const input: FollowupSaveInput = {
  kind: 'task',
  title: 'Review design',
  description: 'Meeting source',
  workspaceId: 'personal-workspace',
  userId: 'requester',
  listId: 'selected-list',
  timezone: 'Asia/Ho_Chi_Minh',
  start: '',
  end: '',
  due: '',
  assignToMe: true,
};
it('assigns a reviewed task to the authenticated profile and chosen list without inventing a deadline', () => {
  expect(buildFollowupPayload(input)).toMatchObject({
    listId: 'selected-list',
    assignee_ids: ['requester'],
    end_date: null,
  });
});
it('requires explicit ownership confirmation and a chosen list', () => {
  expect(() => buildFollowupPayload({ ...input, assignToMe: false })).toThrow();
  expect(() => buildFollowupPayload({ ...input, listId: '' })).toThrow();
});
it('serializes event instants and rejects reversed or missing intervals', () => {
  const event = {
    ...input,
    kind: 'event' as const,
    start: '2026-09-15T09:00',
    end: '2026-09-15T10:00',
  };
  expect(buildFollowupPayload(event)).toMatchObject({
    start_at: '2026-09-15T02:00:00.000Z',
    end_at: '2026-09-15T03:00:00.000Z',
  });
  expect(() =>
    buildFollowupPayload({ ...event, end: '2026-09-15T08:00' })
  ).toThrow();
  expect(() => buildFollowupPayload({ ...event, start: '' })).toThrow();
});
