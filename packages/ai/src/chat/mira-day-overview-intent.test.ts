import type { ModelMessage } from 'ai';
import { describe, expect, it } from 'vitest';
import { shouldUseDayOverviewForLatestUserMessage } from './mira-day-overview-intent';

const ask = (text: string): ModelMessage[] => [
  { role: 'user', content: [{ type: 'text', text }] },
];

describe('shouldUseDayOverviewForLatestUserMessage', () => {
  it.each([
    "Today's Agenda",
    'what is on my schedule today?',
    'Plan my day',
    'Lịch hôm nay',
    'hôm nay tôi có gì',
  ])('routes read-only agenda ask %s', (text) => {
    expect(shouldUseDayOverviewForLatestUserMessage(ask(text))).toBe(true);
  });

  it.each([
    'Add a meeting to my agenda at 3pm',
    'reschedule my day',
    'Thêm việc vào lịch hôm nay',
    'Summarize this document',
    '',
  ])('keeps normal discovery for %s', (text) => {
    expect(shouldUseDayOverviewForLatestUserMessage(ask(text))).toBe(false);
  });

  it('only reads the latest user message', () => {
    const messages: ModelMessage[] = [
      ...ask("Today's Agenda"),
      { role: 'assistant', content: 'Here is your day.' },
      ...ask('Translate this to French'),
    ];
    expect(shouldUseDayOverviewForLatestUserMessage(messages)).toBe(false);
  });
});
