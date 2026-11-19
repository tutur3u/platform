/**
 * Server switches for the class timer and class attendance.
 * Each stays off unless its value is the exact string "true".
 * An absent value is off, which is the production default.
 */
export const MEET_CLASS_ATTENDANCE_ENV = 'MEET_CLASS_ATTENDANCE_ENABLED';
export const MEET_CLASS_TIMER_ENV = 'MEET_CLASS_TIMER_ENABLED';

export type MeetClassFeatureEnv = object | null | undefined;

export type MeetClassFeatures = {
  attendance: boolean;
  timer: boolean;
};

function runtimeProcessEnv(): MeetClassFeatureEnv {
  const proc = (globalThis as { process?: { env?: object } }).process;
  return proc?.env;
}

function flagEnabled(env: MeetClassFeatureEnv, name: string) {
  const source = env === undefined ? runtimeProcessEnv() : env;
  if (!source) return false;
  try {
    return Reflect.get(source, name) === 'true';
  } catch {
    return false;
  }
}

export function meetClassAttendanceEnabled(env?: MeetClassFeatureEnv) {
  return flagEnabled(env, MEET_CLASS_ATTENDANCE_ENV);
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
