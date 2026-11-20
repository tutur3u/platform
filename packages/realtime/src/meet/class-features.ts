/**
 * Server switches for the class timer and class attendance.
 * Each stays off unless its value is the exact string "true".
 * An absent value is off, which is the production default.
 * Attendance also requires the proof that the Cloudflare retention and
 * erasure jobs run. The flag alone does not enable it.
 */
export const MEET_CLASS_ATTENDANCE_ENV = 'MEET_CLASS_ATTENDANCE_ENABLED';
export const MEET_CLASS_TIMER_ENV = 'MEET_CLASS_TIMER_ENABLED';
export const MEET_ATTENDANCE_RETENTION_ENV =
  'MEET_ATTENDANCE_RETENTION_VERIFIED';
export const MEET_ATTENDANCE_RETENTION_JOB_ID = 'meet-attendance-retention';
export const MEET_ATTENDANCE_RETENTION_CRON = '17 18 * * *';
export const MEET_ATTENDANCE_RETENTION_RPC = 'purge_expired_meet_attendance';
export const MEET_ATTENDANCE_ERASURE_JOB_ID = 'meet-attendance-erasure';
export const MEET_ATTENDANCE_RETENTION_PROOF = `${MEET_ATTENDANCE_RETENTION_JOB_ID}:${MEET_ATTENDANCE_RETENTION_CRON}:${MEET_ATTENDANCE_RETENTION_RPC}+${MEET_ATTENDANCE_ERASURE_JOB_ID}`;

export type MeetClassFeatureEnv = object | null | undefined;

export type MeetClassFeatures = {
  attendance: boolean;
  timer: boolean;
};

function runtimeProcessEnv(): MeetClassFeatureEnv {
  const proc = (globalThis as { process?: { env?: object } }).process;
  return proc?.env;
}

function envValue(env: MeetClassFeatureEnv, name: string) {
  const source = env === undefined ? runtimeProcessEnv() : env;
  if (!source) return undefined;
  try {
    return Reflect.get(source, name);
  } catch {
    return undefined;
  }
}

function flagEnabled(env: MeetClassFeatureEnv, name: string) {
  return envValue(env, name) === 'true';
}

/** True only when the value is the Cloudflare retention and erasure job proof. */
export function meetAttendanceRetentionVerified(env?: MeetClassFeatureEnv) {
  return (
    envValue(env, MEET_ATTENDANCE_RETENTION_ENV) ===
    MEET_ATTENDANCE_RETENTION_PROOF
  );
}

export function meetClassAttendanceEnabled(env?: MeetClassFeatureEnv) {
  return (
    flagEnabled(env, MEET_CLASS_ATTENDANCE_ENV) &&
    meetAttendanceRetentionVerified(env)
  );
}

export function meetClassTimerEnabled(env?: MeetClassFeatureEnv) {
  return flagEnabled(env, MEET_CLASS_TIMER_ENV);
}

export function meetClassFeatures(
  env?: MeetClassFeatureEnv
): MeetClassFeatures {
  return {
    attendance: meetClassAttendanceEnabled(env),
    timer: meetClassTimerEnabled(env),
  };
}
