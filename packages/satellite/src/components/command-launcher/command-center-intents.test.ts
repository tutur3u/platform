import { describe, expect, it } from 'vitest';
import {
  boundIntentText,
  buildAskMiraIntentUrl,
  buildCreateTaskIntentUrl,
  MIRA_PROMPT_INTENT_MAX_LENGTH,
  TASK_TITLE_INTENT_MAX_LENGTH,
} from './command-center-intents';

const team = { id: '00000000-0000-4000-8000-000000000001', personal: false };
const origin = 'https://example.test';

describe('command center typed intents', () => {
  it('fits the receivers UTF-16 limits without splitting surrogate pairs', () => {
    const emoji = '\u{1F600}';
    expect(boundIntentText(`  ${emoji.repeat(3)}  `, 2)).toBe(emoji);
    expect(boundIntentText(`a${emoji}b`, 2)).toBe('a');
    expect(boundIntentText(emoji, 1)).toBe('');
    expect(
      [...boundIntentText('x'.repeat(600), TASK_TITLE_INTENT_MAX_LENGTH)]
    ).toHaveLength(TASK_TITLE_INTENT_MAX_LENGTH);
  });

  it('keeps non-BMP task titles and prompts within their receiving limits', () => {
    const query = '\u{1F600}'.repeat(MIRA_PROMPT_INTENT_MAX_LENGTH);
    const task = new URL(buildCreateTaskIntentUrl({ currentOrigin: origin, query, workspace: team }) ?? '');
    const mira = new URL(buildAskMiraIntentUrl({ currentOrigin: origin, query, workspace: team }) ?? '');
    expect(task.searchParams.get('title')).toBe(query.slice(0, TASK_TITLE_INTENT_MAX_LENGTH));
    expect(mira.searchParams.get('prompt')).toBe(query.slice(0, MIRA_PROMPT_INTENT_MAX_LENGTH));
  });

  it('targets the workspace Tasks composer with an encoded title', () => {
    const url = new URL(
      buildCreateTaskIntentUrl({
        currentOrigin: origin,
        query: ' a&b=c #tag ',
        workspace: team,
      }) ?? ''
    );
    expect(url.pathname.endsWith(`/${team.id}/tasks/new`)).toBe(true);
    expect(url.searchParams.get('title')).toBe('a&b=c #tag');
    expect(url.searchParams.get('source')).toBe('command-launcher');
    expect(url.hash).toBe('');
  });

  it('falls back to the personal Tasks composer without a workspace', () => {
    const url = new URL(
      buildCreateTaskIntentUrl({
        currentOrigin: origin,
        query: 'x',
        workspace: null,
      }) ?? ''
    );
    expect(url.pathname.endsWith('/personal/tasks/new')).toBe(true);
  });

  it('targets the workspace Mira home with a bounded prompt', () => {
    const url = new URL(
      buildAskMiraIntentUrl({
        currentOrigin: origin,
        query: 'y'.repeat(MIRA_PROMPT_INTENT_MAX_LENGTH + 10),
        workspace: team,
      }) ?? ''
    );
    expect(url.pathname.endsWith(`/${team.id}`)).toBe(true);
    expect(url.searchParams.get('prompt')).toHaveLength(
      MIRA_PROMPT_INTENT_MAX_LENGTH
    );
  });

  it('uses the personal workspace for Mira without a workspace', () => {
    const url = new URL(
      buildAskMiraIntentUrl({ currentOrigin: origin, query: 'z', workspace: null }) ??
        ''
    );
    expect(url.pathname.endsWith('/personal')).toBe(true);
    expect(url.searchParams.get('prompt')).toBe('z');
  });
});
