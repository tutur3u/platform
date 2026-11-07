import { describe, expect, it } from 'vitest';
import { TutoringSessionUpdateSchema } from './shared';

describe('session campus update validation', () => {
  it('normalizes an empty reset without changing any other fields', () => {
    expect(TutoringSessionUpdateSchema.parse({ campusOverride: '  ' })).toEqual(
      { campusOverride: null }
    );
    expect(TutoringSessionUpdateSchema.parse({ campusOverride: null })).toEqual(
      { campusOverride: null }
    );
    expect(
      TutoringSessionUpdateSchema.parse({ campusOverride: ' North ' })
    ).toEqual({ campusOverride: 'North' });
  });
  it('rejects non-labels and labels above the shared limit', () => {
    for (const campusOverride of [7, {}, 'x'.repeat(81)]) {
      expect(
        TutoringSessionUpdateSchema.safeParse({ campusOverride }).success
      ).toBe(false);
    }
    expect(
      TutoringSessionUpdateSchema.safeParse({ campusOverride: 'x'.repeat(80) })
        .success
    ).toBe(true);
  });
  it('does not reset an override during unrelated updates', () => {
    expect(TutoringSessionUpdateSchema.parse({ content: 'Lesson' })).toEqual({
      content: 'Lesson',
    });
  });
});
