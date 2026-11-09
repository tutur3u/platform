import { describe, expect, it } from 'vitest';
import { projectTicketKeySchema } from './task-project-ticket-key';

describe('projectTicketKeySchema', () => {
  it.each(['PLA', 'A2', 'ABCDEFGHIJ'])('accepts %s', (value) => {
    expect(projectTicketKeySchema.parse(value)).toBe(value);
  });
  it.each([
    '',
    'A',
    'pla',
    '1PLA',
    'PL-A',
    'PLA_',
    'ABCDEFGHIJK',
    ' PL',
    'ĐEV',
  ])('rejects %s', (value) => {
    expect(projectTicketKeySchema.safeParse(value).success).toBe(false);
  });
});
