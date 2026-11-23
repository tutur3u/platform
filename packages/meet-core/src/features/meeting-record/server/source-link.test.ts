import { expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { linkSourceMeeting } from './source-link';

const wsId = '22222222-2222-4222-8222-222222222222';
const base = {
  wsId,
  workspaceId: wsId,
  meetingId: '33333333-3333-4333-8333-333333333333',
  user: { id: '11111111-1111-4111-8111-111111111111' },
};

it('records the source meeting for a task saved in the meeting workspace', async () => {
  const insert = vi.fn(async () => ({ error: null }));
  const from = vi.fn(() => ({ insert }));
  const schema = vi.fn(() => ({ from }));
  await linkSourceMeeting({ ...base, db: { schema } as never }, 'task-1');
  expect(schema).toHaveBeenCalledWith('private');
  expect(from).toHaveBeenCalledWith('meeting_task_links');
  expect(insert).toHaveBeenCalledWith({
    meeting_id: base.meetingId,
    task_id: 'task-1',
    ws_id: wsId,
    link_kind: 'source',
    created_by: base.user.id,
  });
});

it('never links a task saved in another workspace', async () => {
  const schema = vi.fn();
  await linkSourceMeeting(
    { ...base, workspaceId: 'personal-ws', db: { schema } as never },
    'task-1'
  );
  expect(schema).not.toHaveBeenCalled();
});

it('does not fail the saved follow-up when linking fails', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const schema = vi.fn(() => {
    throw new Error('offline');
  });
  await expect(
    linkSourceMeeting({ ...base, db: { schema } as never }, 'task-1')
  ).resolves.toBeUndefined();
  expect(warn).toHaveBeenCalled();
  warn.mockRestore();
});
