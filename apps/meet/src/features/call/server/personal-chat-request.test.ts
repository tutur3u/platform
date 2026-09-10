import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ answer: vi.fn(), service: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('../lib/call-access', () => ({
  MeetCallAccessError: class extends Error {
    constructor(
      public status: number,
      message: string
    ) {
      super(message);
    }
  },
}));
vi.mock('./personal-assistant', () => ({
  answerPersonalMeetChat: mocks.answer,
}));
vi.mock('./room-service', () => ({ callRoomService: mocks.service }));

import { requestPersonalMeetChat } from './personal-chat-request';

it('replays a stored answer after a lost response without generating or charging again', async () => {
  mocks.answer.mockResolvedValue({ text: 'Private' });
  mocks.service
    .mockResolvedValueOnce({ started: true })
    .mockRejectedValueOnce(new Error('response lost'))
    .mockResolvedValueOnce({ text: 'Private' });
  const access = { user: { id: 'user' } } as Parameters<
    typeof requestPersonalMeetChat
  >[0];
  const input = {
    requestId: crypto.randomUUID(),
    startedAt: Date.now(),
    question: 'Hello',
    timezone: 'UTC',
    history: [],
  };
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
  await expect(requestPersonalMeetChat(access, input)).resolves.toEqual({
    text: 'Private',
  });
  expect(warning).toHaveBeenCalledWith(
    'Meet private answer recovery storage unavailable'
  );
  warning.mockRestore();
  expect(await requestPersonalMeetChat(access, input)).toEqual({
    text: 'Private',
  });
  expect(mocks.answer).toHaveBeenCalledOnce();
  expect(mocks.service.mock.calls[0]![1]).toEqual(
    mocks.service.mock.calls[2]![1]
  );
});
