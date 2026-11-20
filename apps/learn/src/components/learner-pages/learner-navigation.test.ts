import { describe, expect, it } from 'vitest';
import { withLearnerStudent } from './learner-navigation';

describe('learner navigation', () => {
  it('retains library and module selections when switching learner context', () => {
    expect(
      withLearnerStudent(
        '/w/courses?view=library&courseId=c&studentId=old#lessons',
        's&1'
      )
    ).toBe('/w/courses?view=library&courseId=c&studentId=s%261#lessons');
    expect(withLearnerStudent('/w/courses/c?moduleId=m', 's')).toBe(
      '/w/courses/c?moduleId=m&studentId=s'
    );
  });

  it('leaves self-directed links intact without a linked learner selection', () => {
    expect(withLearnerStudent('/w/courses?view=library', null)).toBe(
      '/w/courses?view=library'
    );
  });
});
