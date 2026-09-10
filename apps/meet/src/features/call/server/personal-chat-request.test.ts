import { beforeEach, expect, it, vi } from 'vitest';

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

beforeEach(() => {
  vi.resetAllMocks();
});

it('replays a stored answer after a lost response without generating or charging again', async () => {
  mocks.answer.mockResolvedValue({ text: 'Private' });
  mocks.service
    .mockResolvedValueOnce({ started: true })
    .mockRejectedValueOnce(new Error('response lost'))
    .mockResolvedValueOnce({ ok: true })
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
  expect(warning).not.toHaveBeenCalled();
  expect(mocks.service.mock.calls[1]![1]).toEqual(
    mocks.service.mock.calls[2]![1]
  );
  warning.mockRestore();
  expect(await requestPersonalMeetChat(access, input)).toEqual({
    text: 'Private',
  });
  expect(mocks.answer).toHaveBeenCalledOnce();
  expect(mocks.service.mock.calls[0]![1]).toEqual(
    mocks.service.mock.calls[3]![1]
  );
});

it('returns the paid answer after bounded identical receipt retries are exhausted', async () => {
  mocks.answer.mockResolvedValue({ text: 'Private' });
  mocks.service
    .mockResolvedValueOnce({ started: true })
    .mockRejectedValue(new Error('storage offline'));
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const access = { user: { id: 'user' } } as Parameters<
    typeof requestPersonalMeetChat
  >[0];
  try {
    await expect(
      requestPersonalMeetChat(access, {
        requestId: crypto.randomUUID(),
        startedAt: Date.now(),
        question: 'Hello',
        timezone: 'UTC',
        history: [],
      })
    ).resolves.toEqual({ text: 'Private' });
    expect(mocks.answer).toHaveBeenCalledOnce();
    expect(mocks.service).toHaveBeenCalledTimes(4);
    const writes = mocks.service.mock.calls.slice(1).map((call) => call[1]);
    expect(writes[0]).toEqual(writes[1]);
    expect(writes[1]).toEqual(writes[2]);
    expect(warning).toHaveBeenCalledWith(
      'Meet private answer recovery storage unavailable'
    );
  } finally {
    warning.mockRestore();
  }
});
