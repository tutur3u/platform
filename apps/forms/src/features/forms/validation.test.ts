import { describe, expect, it } from 'vitest';
import {
  getIntrinsicValidationMode,
  getValidationConstraintHint,
  validateQuestionValue,
} from './validation';

const translate = (key: string, values?: Record<string, string | number>) =>
  values ? `${key}:${JSON.stringify(values)}` : key;

describe('getIntrinsicValidationMode', () => {
  it('maps each self-validating type to its mode', () => {
    expect(getIntrinsicValidationMode('email')).toBe('email');
    expect(getIntrinsicValidationMode('url')).toBe('url');
    expect(getIntrinsicValidationMode('phone')).toBe('phone');
    expect(getIntrinsicValidationMode('number')).toBe('real');
  });

  it('leaves types that carry no intrinsic rule alone', () => {
    expect(getIntrinsicValidationMode('short_text')).toBeNull();
    expect(getIntrinsicValidationMode('long_text')).toBeNull();
    expect(getIntrinsicValidationMode(undefined)).toBeNull();
  });
});

describe('validateQuestionValue', () => {
  it('accepts an empty value regardless of type, leaving that to `required`', () => {
    expect(validateQuestionValue('', {}, 'email').valid).toBe(true);
    expect(validateQuestionValue(null, {}, 'number').valid).toBe(true);
  });

  it('validates an email question without the author opting in', () => {
    expect(
      validateQuestionValue('someone@example.com', {}, 'email').valid
    ).toBe(true);
    expect(validateQuestionValue('not-an-email', {}, 'email').valid).toBe(
      false
    );
  });

  it('rejects non-http(s) urls, which `new URL` alone would accept', () => {
    expect(validateQuestionValue('https://example.com', {}, 'url').valid).toBe(
      true
    );
    expect(
      validateQuestionValue('http://example.com/a?b=c', {}, 'url').valid
    ).toBe(true);
    expect(validateQuestionValue('javascript:alert(1)', {}, 'url').valid).toBe(
      false
    );
    expect(validateQuestionValue('mailto:a@b.com', {}, 'url').valid).toBe(
      false
    );
    // A hostname with no dot is a bare scheme+word, not a reachable link.
    expect(validateQuestionValue('https://localhost', {}, 'url').valid).toBe(
      false
    );
  });

  it('honours the url validation mode on a plain text question', () => {
    // This was silently a no-op before: `url` was offered in the picker but
    // had no branch, so every value passed.
    const settings = { validationMode: 'url' };
    expect(
      validateQuestionValue('nonsense', settings, 'short_text').valid
    ).toBe(false);
    expect(
      validateQuestionValue('https://example.com', settings, 'short_text').valid
    ).toBe(true);
  });

  it('accepts the punctuation people actually type in phone numbers', () => {
    for (const value of [
      '+1 (555) 000-0000',
      '0900.000.000',
      '+84 90 000 0000',
    ]) {
      expect(validateQuestionValue(value, {}, 'phone').valid).toBe(true);
    }
  });

  it('rejects phone numbers with letters or an implausible digit count', () => {
    expect(validateQuestionValue('call me', {}, 'phone').valid).toBe(false);
    expect(validateQuestionValue('12345', {}, 'phone').valid).toBe(false);
    expect(validateQuestionValue('1'.repeat(21), {}, 'phone').valid).toBe(
      false
    );
  });

  it('applies min and max to a number question', () => {
    const settings = { validationMin: 1, validationMax: 10 };
    expect(validateQuestionValue('5', settings, 'number').valid).toBe(true);
    expect(validateQuestionValue('0', settings, 'number').valid).toBe(false);
    expect(validateQuestionValue('11', settings, 'number').valid).toBe(false);
    expect(validateQuestionValue('nope', settings, 'number').valid).toBe(false);
  });

  it('enforces a step without tripping over floating-point modulo', () => {
    const settings = { numberStep: 0.1 };
    // 0.3 % 0.1 is 0.0999... in IEEE754, so a naive check rejects this.
    expect(validateQuestionValue('0.3', settings, 'number').valid).toBe(true);
    expect(validateQuestionValue('0.25', settings, 'number').valid).toBe(false);
  });

  it('measures the step from the minimum, not from zero', () => {
    const settings = { validationMin: 1, numberStep: 2 };
    expect(validateQuestionValue('5', settings, 'number').valid).toBe(true);
    expect(validateQuestionValue('4', settings, 'number').valid).toBe(false);
  });

  it('layers an author rule on top of the type rule rather than replacing it', () => {
    // A regex that a non-number would satisfy must not let a non-number pass.
    const settings = { validationMode: 'regex', validationPattern: '^.+$' };
    expect(validateQuestionValue('abc', settings, 'number').valid).toBe(false);
    expect(validateQuestionValue('42', settings, 'number').valid).toBe(true);
  });

  it('uses the author message when one is set', () => {
    const result = validateQuestionValue(
      'nope',
      { validationMessage: 'Enter your work email' },
      'email'
    );
    expect(result.valid).toBe(false);
    expect(result.message).toBe('Enter your work email');
  });
});

describe('getValidationConstraintHint', () => {
  it('stays quiet for types whose input already signals the format', () => {
    expect(getValidationConstraintHint({}, translate, 'email')).toBeNull();
    expect(getValidationConstraintHint({}, translate, 'phone')).toBeNull();
    expect(getValidationConstraintHint({}, translate, 'url')).toBeNull();
  });

  it('stays quiet for an unbounded number question', () => {
    expect(getValidationConstraintHint({}, translate, 'number')).toBeNull();
  });

  it('describes a bounded number question', () => {
    expect(
      getValidationConstraintHint(
        { validationMin: 1, validationMax: 10 },
        translate,
        'number'
      )
    ).toBe('runtime.validation_constraint_real_range:{"min":1,"max":10}');
  });

  it('prefers the step wording once a step is set', () => {
    expect(
      getValidationConstraintHint({ numberStep: 5 }, translate, 'number')
    ).toBe('runtime.validation_constraint_step:{"step":5}');
    expect(
      getValidationConstraintHint(
        { validationMin: 0, validationMax: 100, numberStep: 5 },
        translate,
        'number'
      )
    ).toBe(
      'runtime.validation_constraint_step_range:{"min":0,"max":100,"step":5}'
    );
  });
});
