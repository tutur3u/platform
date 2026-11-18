import { describe, expect, it } from 'vitest';
import {
  matchMiraSlashCommands,
  miraSlashCommandDraft,
} from './mira-slash-commands';

describe('Room Mira command matching', () => {
  it.each([
    ['/', ['poll', 'summary', 'actions', 'review']],
    ['/P', ['poll']],
    ['/re', ['review']],
    ['/actions', ['actions']],
    ['/unknown', []],
    ['/poll context', []],
    ['@Tuturuuu /poll', []],
    ['https://example.invalid/', []],
    ['//', []],
  ] as const)('matches the composer draft %s', (draft, commands) => {
    expect(matchMiraSlashCommands(draft)).toEqual(commands);
  });

  it('expands to the existing room mention syntax', () => {
    expect(miraSlashCommandDraft('Summarize the room.')).toBe(
      '@Tuturuuu Summarize the room.'
    );
  });
});
