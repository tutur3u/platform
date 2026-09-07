import { describe, expect, it } from 'vitest';
import { prepareParticipantName } from './participant-name';

describe('prepareParticipantName', () => {
  it('trims suggested account names', () => {
    expect(prepareParticipantName('  Anh Châu  ')).toBe('Anh Châu');
  });

  it('does not split a surrogate pair at the profile limit', () => {
    expect(prepareParticipantName(`${'a'.repeat(99)}𝒜`)).toBe('a'.repeat(99));
    expect(prepareParticipantName(`${'a'.repeat(98)}𝒜`)).toHaveLength(100);
  });

  it('keeps astral characters within the API UTF-16 limit', () => {
    expect(prepareParticipantName('𝒜'.repeat(100))).toBe('𝒜'.repeat(50));
  });
});
