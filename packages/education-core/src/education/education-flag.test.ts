import { describe, expect, it, vi } from 'vitest';
import { isEducationEnabled } from './education-flag';

vi.mock('next/server', () => {
  throw new Error('Flag parser must be framework-free');
});

describe('education flag parsing', () => {
  it.each(['true', ' TRUE ', '\tTrue\n'])('accepts %j', (value) => {
    expect(isEducationEnabled(value)).toBe(true);
  });
  it.each(['false', '', '1', 'true false', null, undefined])(
    'rejects %j',
    (value) => {
      expect(isEducationEnabled(value)).toBe(false);
    }
  );
});
