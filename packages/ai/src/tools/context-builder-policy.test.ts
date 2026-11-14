import { describe, expect, it } from 'vitest';
import { resolveMiraContextNeeds } from './context-builder-policy';

const ALL = { tasks: true, calendar: true, finance: true, memories: true };
const NONE = { tasks: false, calendar: false, finance: false, memories: false };
const MEMORY_ONLY = { ...NONE, memories: true };

describe('resolveMiraContextNeeds', () => {
  it.each([undefined, null, '', '   '])(
    'loads every section without a usable turn signal (%j)',
    (message) => {
      expect(resolveMiraContextNeeds(message)).toEqual(ALL);
    }
  );

  it.each([
    'hi',
    'Hello Mira!',
    'hey there 👋',
    'good morning',
    'thanks!',
    'Thank you so much',
    'bye',
    'haha nice',
    'Xin chào',
    'chào em',
    'cảm ơn nhiều nha',
    'Cam on',
  ])('loads no optional context for the social turn %j', (message) => {
    expect(resolveMiraContextNeeds(message)).toEqual(NONE);
  });

  it.each([
    ['my tasks', { tasks: true, calendar: false, finance: false }],
    ['what is overdue?', { tasks: true, calendar: false, finance: false }],
    ['việc cần làm', { tasks: true, calendar: false, finance: false }],
    ["what's on tomorrow?", { tasks: true, calendar: true, finance: false }],
    ['am I free next Friday', { tasks: true, calendar: true, finance: false }],
    ['move it to 11/20', { tasks: true, calendar: true, finance: false }],
    ['lịch hôm nay', { tasks: true, calendar: true, finance: false }],
    ['lich hom nay', { tasks: true, calendar: true, finance: false }],
    [
      'book a meeting with An',
      { tasks: false, calendar: true, finance: false },
    ],
    ['how much did I spend?', { tasks: false, calendar: false, finance: true }],
    ['wallet balance', { tasks: false, calendar: false, finance: true }],
    ['chi tiêu tháng này', { tasks: true, calendar: true, finance: true }],
    [
      'switch to the Marketing workspace',
      { tasks: true, calendar: true, finance: true },
    ],
    ['catch me up', { tasks: true, calendar: true, finance: true }],
    [
      'hi, what are my tasks today?',
      { tasks: true, calendar: true, finance: false },
    ],
  ])('loads the needed domains for %j', (message, domains) => {
    expect(resolveMiraContextNeeds(message)).toEqual({
      ...domains,
      memories: true,
    });
  });

  it.each([
    'What do you remember about me?',
    'what is my favorite color',
    'remember that I prefer metric units',
    'explain recursion',
    'ok',
    'yes',
    'hi Chachipiki',
  ])('keeps saved memories for the non-social turn %j', (message) => {
    expect(resolveMiraContextNeeds(message)).toMatchObject({ memories: true });
  });

  it('keeps only memories for a general question', () => {
    expect(resolveMiraContextNeeds('explain recursion')).toEqual(MEMORY_ONLY);
  });
});
