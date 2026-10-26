import { describe, expect, it } from 'vitest';
import { storedTutoringContent } from './use-tutoring-create';

describe('stored tutoring content', () => {
  it('keeps untouched make-up notes linked by saving them empty', () => {
    expect(
      storedTutoringContent({
        content: '2026-10-20: Unit 4',
        linkedContent: '2026-10-20: Unit 4',
        reasonType: 'ABSENT_RECOVERY',
      })
    ).toBe('');
    expect(
      storedTutoringContent({
        content: '',
        linkedContent: '',
        reasonType: 'ABSENT_RECOVERY',
      })
    ).toBe('');
  });

  it('saves edited make-up notes and other reasons as written', () => {
    expect(
      storedTutoringContent({
        content: 'Revise Unit 4 vocabulary',
        linkedContent: '2026-10-20: Unit 4',
        reasonType: 'ABSENT_RECOVERY',
      })
    ).toBe('Revise Unit 4 vocabulary');
    expect(
      storedTutoringContent({
        content: 'Reading practice',
        linkedContent: 'Reading practice',
        reasonType: 'WEAK_SUPPORT',
      })
    ).toBe('Reading practice');
  });
});
