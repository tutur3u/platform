import { expect, it } from 'vitest';
import {
  MEET_ATTENDANCE_RETENTION_PROOF,
  meetClassAttendanceEnabled,
} from './class-features';

it('stays off until the Cloudflare retention and erasure proof is present', () => {
  expect(
    meetClassAttendanceEnabled({ MEET_CLASS_ATTENDANCE_ENABLED: 'true' })
  ).toBe(false);
  expect(
    meetClassAttendanceEnabled({
      MEET_CLASS_ATTENDANCE_ENABLED: 'true',
      MEET_ATTENDANCE_RETENTION_VERIFIED: 'true',
    })
  ).toBe(false);
  expect(
    meetClassAttendanceEnabled({
      MEET_CLASS_ATTENDANCE_ENABLED: 'false',
      MEET_ATTENDANCE_RETENTION_VERIFIED: MEET_ATTENDANCE_RETENTION_PROOF,
    })
  ).toBe(false);
  expect(
    meetClassAttendanceEnabled({
      MEET_CLASS_ATTENDANCE_ENABLED: 'true',
      MEET_ATTENDANCE_RETENTION_VERIFIED: MEET_ATTENDANCE_RETENTION_PROOF,
    })
  ).toBe(true);
  expect(
    meetClassAttendanceEnabled({
      MEET_CLASS_ATTENDANCE_ENABLED: 'true',
      MEET_ATTENDANCE_RETENTION_VERIFIED:
        'meet-attendance-retention:17 18 * * *:purge_expired_meet_attendance',
    })
  ).toBe(false);
  expect(MEET_ATTENDANCE_RETENTION_PROOF).toBe(
    'meet-attendance-retention:17 18 * * *:purge_expired_meet_attendance+meet-attendance-erasure'
  );
});
