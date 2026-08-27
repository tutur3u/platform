import { describe, expect, it } from 'vitest';
import { describeSubmissionFailure } from './submission-errors';

const t = (key: string, values?: Record<string, string | number>) =>
  values ? `${key}:${JSON.stringify(values)}` : key;

function validation(overrides: {
  missingRequired?: string[];
  validationErrors?: string[];
}) {
  return {
    valid: false,
    missingRequired: overrides.missingRequired ?? [],
    validationErrors: overrides.validationErrors ?? [],
    validationErrorsByQuestionId: {},
  };
}

describe('describeSubmissionFailure', () => {
  it('reports missing answers, listing them', () => {
    expect(
      describeSubmissionFailure(
        validation({ missingRequired: ['Name', 'Email'] }),
        t
      )
    ).toBe('runtime.missing_required_answers:{"items":"Name, Email"}');
  });

  it('prefers missing answers over format errors', () => {
    // Someone who left three questions blank needs to know that, not that the
    // one email they did fill in has a typo.
    expect(
      describeSubmissionFailure(
        validation({
          missingRequired: ['Name'],
          validationErrors: ['Email: not an email'],
        }),
        t
      )
    ).toBe('runtime.missing_required_answers:{"items":"Name"}');
  });

  it('falls back to the first format error when nothing is missing', () => {
    expect(
      describeSubmissionFailure(
        validation({ validationErrors: ['Email: not an email', 'second'] }),
        t
      )
    ).toBe('Email: not an email');
  });

  it('returns null when the validator produced no message', () => {
    // The field highlights are then the whole story; a sentence above them
    // invented here would be noise.
    expect(describeSubmissionFailure(validation({}), t)).toBeNull();
  });
});
