import { describe, expect, it } from 'vitest';
import en from '../../messages/en.json';
import vi from '../../messages/vi.json';

const REQUIRED_ATTENDANCE_KEYS = [
  'absent',
  'clear',
  'help_description',
  'help_title',
  'late',
  'legacy_date_only_mode',
  'no_changes',
  'no_session_for_day',
  'notes_placeholder',
  'phone_fallback',
  'present',
  'save_error',
  'save_success',
  'select_session',
  'session_count_short',
  'status_label',
  'summary_absent',
  'summary_late',
  'summary_not_marked',
  'summary_present',
  'summary_total',
  'unsaved_changes_message',
] as const;

describe('Contacts attendance translations', () => {
  it.each([
    ['English', en],
    ['Vietnamese', vi],
  ])('contains every attendance UI key in %s', (_locale, messages) => {
    const attendance = messages['ws-user-group-attendance'];

    for (const key of REQUIRED_ATTENDANCE_KEYS) {
      expect(attendance[key], key).toBeTruthy();
      expect(attendance[key], key).not.toContain('ws-user-group-attendance');
    }
  });
});
