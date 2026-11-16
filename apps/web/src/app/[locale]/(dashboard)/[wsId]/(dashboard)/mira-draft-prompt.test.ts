import { describe, expect, it } from 'vitest';
import {
  MIRA_DRAFT_PROMPT_MAX_LENGTH,
  parseMiraDraftPrompt,
} from './mira-draft-prompt';

describe('parseMiraDraftPrompt', () => {
  it('accepts one trimmed prompt with line breaks', () => {
    expect(parseMiraDraftPrompt('  Plan my week\r\nthen tasks  ')).toBe(
      'Plan my week\nthen tasks'
    );
  });

  it('accepts exactly the limit and rejects one character more, whole', () => {
    expect(parseMiraDraftPrompt('a'.repeat(MIRA_DRAFT_PROMPT_MAX_LENGTH))).toHaveLength(
      MIRA_DRAFT_PROMPT_MAX_LENGTH
    );
    expect(
      parseMiraDraftPrompt('a'.repeat(MIRA_DRAFT_PROMPT_MAX_LENGTH + 1))
    ).toBeUndefined();
  });

  it('rejects missing, repeated and empty values', () => {
    expect(parseMiraDraftPrompt(undefined)).toBeUndefined();
    expect(parseMiraDraftPrompt(['one', 'two'])).toBeUndefined();
    expect(parseMiraDraftPrompt('   \n\t ')).toBeUndefined();
    expect(parseMiraDraftPrompt('\u0000\u0007')).toBeUndefined();
  });

  it('removes control characters but keeps text and tabs', () => {
    expect(parseMiraDraftPrompt('Hi\u0000 there\u001b\tok')).toBe('Hi there\tok');
  });
});
