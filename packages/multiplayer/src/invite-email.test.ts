import { describe, expect, it } from 'vitest';
import { isInviteEmail } from './index';

describe('isInviteEmail', () => {
  it.each([
    'learner@example.com',
    'first.last+tag@sub.example.co',
    'a@b.c',
    'a@b..c',
  ])('accepts %s', (email) => {
    expect(isInviteEmail(email)).toBe(true);
  });

  it.each([
    '',
    '@example.com',
    'learner@',
    'learner@example',
    'learner@.com',
    'learner@example.',
    'learner@@example.com',
    'learner@exa@mple.com',
    'lear ner@example.com',
    'learner@example.com\n',
  ])('rejects %j', (email) => {
    expect(isInviteEmail(email)).toBe(false);
  });

  it('matches the previous pattern on generated inputs', () => {
    const previous = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
    const alphabet = ['a', '.', '@', ' '];
    const inputs = [''];
    for (let length = 1; length <= 6; length += 1) {
      for (const prefix of inputs.filter((v) => v.length === length - 1)) {
        for (const character of alphabet) inputs.push(prefix + character);
      }
    }
    for (const input of inputs) {
      expect(isInviteEmail(input), input).toBe(previous.test(input));
    }
  });

  it('rejects pathological input in linear time', () => {
    const startedAt = performance.now();
    expect(isInviteEmail(`a@${'.'.repeat(100_000)}@`)).toBe(false);
    expect(performance.now() - startedAt).toBeLessThan(500);
  });
});
