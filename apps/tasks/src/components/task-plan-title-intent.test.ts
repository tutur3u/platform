import { describe, expect, it } from 'vitest';
import {
  parseTaskTitleIntent,
  TASK_TITLE_INTENT_MAX_LENGTH,
  urlWithoutTaskTitleIntent,
} from './task-plan-title-intent';

const params = (search: string) => new URLSearchParams(search);

describe('parseTaskTitleIntent', () => {
  it('accepts one bounded title', () => {
    expect(parseTaskTitleIntent(params('title=%20Ship%20it%20'))).toBe(
      'Ship it'
    );
    expect(
      parseTaskTitleIntent(
        params(`title=${'é'.repeat(TASK_TITLE_INTENT_MAX_LENGTH)}`)
      )
    ).toHaveLength(TASK_TITLE_INTENT_MAX_LENGTH);
  });

  it('rejects missing, repeated, blank and oversized titles', () => {
    expect(parseTaskTitleIntent(null)).toBeNull();
    expect(parseTaskTitleIntent(params(''))).toBeNull();
    expect(parseTaskTitleIntent(params('title=a&title=b'))).toBeNull();
    expect(parseTaskTitleIntent(params('title=%0A%09'))).toBeNull();
    expect(
      parseTaskTitleIntent(
        params(`title=${'a'.repeat(TASK_TITLE_INTENT_MAX_LENGTH + 1)}`)
      )
    ).toBeNull();
  });

  it('keeps markup as plain text', () => {
    expect(parseTaskTitleIntent(params('title=%3Cb%3Ex%3C%2Fb%3E'))).toBe(
      '<b>x</b>'
    );
  });
});

describe('urlWithoutTaskTitleIntent', () => {
  it('removes the intent and the launcher source only', () => {
    expect(
      urlWithoutTaskTitleIntent(
        'https://tasks.example/ws/tasks/new?source=command-launcher&title=x&lettinWorld=w#h'
      )
    ).toBe('/ws/tasks/new?lettinWorld=w#h');
    expect(
      urlWithoutTaskTitleIntent('https://tasks.example/ws/tasks/new?source=x')
    ).toBeNull();
  });
});
