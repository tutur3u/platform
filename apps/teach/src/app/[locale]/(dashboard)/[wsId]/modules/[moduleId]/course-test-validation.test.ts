import { describe, expect, it } from 'vitest';
import { validateCourseTestForm } from './course-test-validation';

describe('validateCourseTestForm', () => {
  it('requires at least one module when module selection is required', () => {
    expect(
      validateCourseTestForm({
        description: '',
        durationInMinutes: '60',
        moduleIds: [],
        name: 'Midterm',
        requireModules: true,
        startAt: '',
      })
    ).toEqual({ error: 'selectModules', success: false });
  });

  it('normalizes valid test payload fields', () => {
    const result = validateCourseTestForm({
      description: '  Covers chapters 1-3  ',
      durationInMinutes: '90',
      moduleIds: ['11111111-1111-4111-8111-111111111111'],
      name: '  Midterm  ',
      requireModules: true,
      startAt: '2999-01-01T08:30',
    });

    expect(result).toEqual({
      data: {
        description: 'Covers chapters 1-3',
        durationInMinutes: 90,
        moduleIds: ['11111111-1111-4111-8111-111111111111'],
        name: 'Midterm',
        startAt: new Date('2999-01-01T08:30').toISOString(),
      },
      success: true,
    });
  });

  it('rejects invalid duration values', () => {
    expect(
      validateCourseTestForm({
        description: '',
        durationInMinutes: '1441',
        name: 'Midterm',
        startAt: '',
      })
    ).toEqual({ error: 'invalidDuration', success: false });

    expect(
      validateCourseTestForm({
        description: '',
        durationInMinutes: '30.5',
        name: 'Midterm',
        startAt: '',
      })
    ).toEqual({ error: 'invalidDuration', success: false });

    expect(
      validateCourseTestForm({
        description: '',
        durationInMinutes: '30 minutes',
        name: 'Midterm',
        startAt: '',
      })
    ).toEqual({ error: 'invalidDuration', success: false });
  });
});
