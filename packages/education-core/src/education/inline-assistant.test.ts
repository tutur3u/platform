import { describe, expect, it } from 'vitest';
import {
  applyInlineSuggestion,
  buildAssistanceMessages,
  MAX_ASSISTANCE_TEXT_LENGTH,
  resolveAssistanceLevel,
  resolveAssistanceSubject,
  validateInlineSuggestions,
  type AssistanceContext,
  type AssistanceSubject,
} from './inline-assistant';

const context: AssistanceContext = {
  workspaceEnabled: true,
  teacherLevel: 'full',
  subject: 'writing',
  locale: 'en',
};
const snapshot = 'She go home.';
const suggestion = {
  id: 'verb',
  from: 4,
  to: 6,
  original: 'go',
  explanation: 'Check subject–verb agreement.',
  replacement: 'goes',
};

describe('inline assistance policy boundary', () => {
  it.each([undefined, null, '', 'FULL', 'answers', {}, true])(
    'fails closed for unknown teacher level %j',
    (teacherLevel) => {
      const policy = { ...context, teacherLevel };
      expect(resolveAssistanceLevel(policy)).toBe('off');
      expect(buildAssistanceMessages(snapshot, policy)).toBeNull();
      expect(
        validateInlineSuggestions(
          { suggestions: [suggestion] },
          snapshot,
          policy
        )
      ).toEqual([]);
    }
  );
  it('workspace disable overrides teacher full and blocks applying cached results', () => {
    const policy = { ...context, workspaceEnabled: false };
    expect(buildAssistanceMessages(snapshot, policy)).toBeNull();
    expect(
      applyInlineSuggestion(snapshot, snapshot, suggestion, policy)
    ).toBeNull();
  });
  it('hints never expose replacements or allow edits', () => {
    const policy = { ...context, teacherLevel: 'hints' };
    const results = validateInlineSuggestions(
      { suggestions: [suggestion] },
      snapshot,
      policy
    );
    expect(results).toEqual([
      {
        id: suggestion.id,
        from: 4,
        to: 6,
        original: 'go',
        explanation: suggestion.explanation,
      },
    ]);
    expect(buildAssistanceMessages(snapshot, policy)?.system).toContain(
      'HINTS ONLY'
    );
    expect(
      applyInlineSuggestion(snapshot, snapshot, suggestion, policy)
    ).toBeNull();
  });
});

describe('provider output validation and edits', () => {
  it('applies only exact snapshot ranges', () => {
    expect(applyInlineSuggestion(snapshot, snapshot, suggestion, context)).toBe(
      'She goes home.'
    );
    expect(
      applyInlineSuggestion(
        'She go home. Today.',
        snapshot,
        suggestion,
        context
      )
    ).toBeNull();
    expect(
      applyInlineSuggestion(
        snapshot,
        snapshot,
        { ...suggestion, original: 'xx' },
        context
      )
    ).toBeNull();
  });
  it.each([
    { from: -1 },
    { from: 4.5 },
    { to: 100 },
    { to: 4 },
    { from: NaN },
    { explanation: '' },
    { replacement: 5 },
    { id: '' },
    { original: 'wrong' },
  ])('rejects malformed or mismatched ranges %j', (patch) => {
    expect(
      validateInlineSuggestions(
        { suggestions: [{ ...suggestion, ...patch }] },
        snapshot,
        context
      )
    ).toEqual([]);
  });
  it.each([
    null,
    [],
    {},
    { suggestions: 'bad' },
    { suggestions: [null, false, 'text'] },
  ])('accepts malformed provider output without throwing %j', (output) => {
    expect(validateInlineSuggestions(output, snapshot, context)).toEqual([]);
  });
  it('rejects duplicate ids and overlapping edits', () => {
    expect(
      validateInlineSuggestions(
        {
          suggestions: [
            suggestion,
            suggestion,
            { ...suggestion, id: 'overlap' },
          ],
        },
        snapshot,
        context
      )
    ).toEqual([suggestion]);
  });
  it('handles UTF-16 offsets and deletion replacements', () => {
    const text = '🧪 H20';
    const edit = {
      ...suggestion,
      from: 3,
      to: 6,
      original: 'H20',
      replacement: 'H₂O',
    };
    expect(applyInlineSuggestion(text, text, edit, context)).toBe('🧪 H₂O');
    expect(
      applyInlineSuggestion(
        snapshot,
        snapshot,
        { ...suggestion, replacement: '' },
        context
      )
    ).toBe('She  home.');
  });
  it('bounds input and does not silently truncate offsets', () => {
    expect(buildAssistanceMessages('   ', context)).toBeNull();
    expect(() =>
      buildAssistanceMessages(
        'a'.repeat(MAX_ASSISTANCE_TEXT_LENGTH + 1),
        context
      )
    ).toThrow(RangeError);
  });
});

describe('subject and language fixtures', () => {
  const fixtures: [AssistanceSubject, string, string][] = [
    ['writing', 'Nguồn trích dẫn của em?', 'Never invent sources'],
    ['math', 'x² = 4; x = 2', 'LaTeX'],
    ['physics', 'v = 3 kg', 'dimensional consistency'],
    ['chemistry', 'H2 + O2 -> H2O', 'conservation of atoms and charge'],
    ['biology', 'Plants get energy from soil.', 'biological concepts'],
    ['general', 'Please check my reasoning.', 'missing context'],
  ];
  it.each(fixtures)(
    'preserves %s student text separately from system instructions',
    (subject, text, guidance) => {
      for (const locale of ['en', 'vi'] as const) {
        const messages = buildAssistanceMessages(text, {
          ...context,
          locale,
          subject,
        });
        expect(messages?.user).toBe(text);
        expect(messages?.system).toContain(guidance);
        expect(messages?.system).toContain(
          locale === 'vi' ? 'Vietnamese' : 'English'
        );
        expect(messages?.system).toContain('untrusted student text');
      }
    }
  );
});

it('falls back to general guidance for unknown subjects', () => {
  for (const subject of [undefined, 'history', 'constructor', '__proto__']) {
    expect(resolveAssistanceSubject(subject)).toBe('general');
  }
});

it('never accepts a range splitting a supplementary Unicode character', () => {
  const text = '🧪';
  expect(
    validateInlineSuggestions(
      {
        suggestions: [
          { ...suggestion, from: 0, to: 1, original: text.slice(0, 1) },
        ],
      },
      text,
      context
    )
  ).toEqual([]);
});

it('caps output processing at twenty suggestions', () => {
  const text = 'a'.repeat(30);
  const suggestions = Array.from({ length: 30 }, (_, i) => ({
    ...suggestion,
    id: String(i),
    from: i,
    to: i + 1,
    original: 'a',
  }));
  expect(
    validateInlineSuggestions({ suggestions }, text, context)
  ).toHaveLength(20);
});
