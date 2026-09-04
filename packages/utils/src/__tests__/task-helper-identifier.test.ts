import { describe, expect, it } from 'vitest';
import { getTicketIdentifier } from '../task-helper';

describe('getTicketIdentifier', () => {
  it('keeps only the prefix while an optimistic task has no display number', () => {
    expect(getTicketIdentifier('VHP', undefined)).toBe('VHP');
    expect(getTicketIdentifier(null, undefined)).toBe('TASK');
  });

  it('keeps the full identifier after the display number is assigned', () => {
    expect(getTicketIdentifier('VHP', 247)).toBe('VHP-247');
  });
});
