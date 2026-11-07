import { describe, expect, it } from 'vitest';
import {
  isTutoringStudentPickerGroupOnly,
  TUTORING_STUDENT_PICKER_GROUP_ONLY_CONFIG_ID,
} from './tutoring-student-picker-flag';

describe('tutoring_student_picker_group_only', () => {
  it('reads the registered workspace config key', () => {
    expect(TUTORING_STUDENT_PICKER_GROUP_ONLY_CONFIG_ID).toBe(
      'tutoring_student_picker_group_only'
    );
  });

  it('is ON only for the exact string true', () => {
    expect(isTutoringStudentPickerGroupOnly('true')).toBe(true);
  });

  it.each([null, undefined, '', 'false', 'TRUE', ' true', '1'])(
    'stays OFF for %j (default, kill switch and read failure)',
    (value) => {
      expect(isTutoringStudentPickerGroupOnly(value)).toBe(false);
    }
  );
});
