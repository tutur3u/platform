import { afterEach, expect, it, vi } from 'vitest';
import { type MeetAssistantContext, meetAssistantTools } from './chat-tools';

const context: MeetAssistantContext = {
  title: 'Test',
  observedAt: '2026-09-09T04:00:00Z',
  timezone: 'Asia/Ho_Chi_Minh',
  participantCount: 2,
  deviceCount: 3,
  participants: [
    { displayName: 'A', role: 'host' },
    { displayName: 'B', role: 'speaker' },
  ],
};
afterEach(() => vi.useRealTimers());
it('provides the real weekday and local date without relying on model memory', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-09T18:00:00Z'));
  const tool = meetAssistantTools(context).get_current_time;
  const result = await tool.execute!(
    {},
    { toolCallId: 'test', messages: [], context: {} }
  );
  expect(result).toMatchObject({
    timezone: 'Asia/Ho_Chi_Minh',
    local: expect.stringContaining('Thursday, September 10, 2026'),
  });
});
it('returns admitted room information and rejects invalid timezones safely', async () => {
  const tools = meetAssistantTools(context);
  expect(
    await tools.get_meeting_context.execute!(
      {},
      { toolCallId: 'test', messages: [], context: {} }
    )
  ).toEqual(context);
  expect(
    await tools.get_current_time.execute!(
      { timezone: 'invalid' },
      { toolCallId: 'test', messages: [], context: {} }
    )
  ).toHaveProperty('error');
});
