import type { HumanFeedbackEvidence } from './feedback-evidence';

export const recoveryRun = {
  id: '11111111-1111-4111-8111-111111111111',
  attempt_count: 2,
  cadence: 'monthly' as const,
  generation_mode: 'ai' as const,
  group_id: '22222222-2222-4222-8222-222222222222',
  period_start: '2026-08-01',
  period_end: '2026-08-31',
  schedule_id: '33333333-3333-4333-8333-333333333333',
  ws_id: '44444444-4444-4444-8444-444444444444',
};

export const recoveryUser = {
  id: '55555555-5555-4555-8555-555555555555',
  display_name: 'Learner',
  full_name: null,
  note: null,
};

export const recoveryReport = {
  ...recoveryRun,
  id: '66666666-6666-4666-8666-666666666666',
  user_id: recoveryUser.id,
  manager_instruction: '',
  updated_at: '2026-08-01T00:00:00.000Z',
  source_context: {},
};

export const recoverySchedule = {
  ...recoveryRun,
  id: recoveryRun.schedule_id,
  created_by: 'teacher-1',
  manager_instruction: '',
  timezone: 'UTC',
};

// Synthetic ready-empty evidence for the mocked context boundary, not SQL proof.
export const recoveryEvidence: HumanFeedbackEvidence = {
  status: 'ready',
  interpretation: 'quoted-observation-data',
  records: [],
  metadata: {
    wsId: recoveryRun.ws_id,
    userId: recoveryUser.id,
    groupId: recoveryRun.group_id,
    periodStart: recoveryRun.period_start,
    periodEnd: recoveryRun.period_end,
    timezonePolicy: 'current-workspace',
    workspaceTimezone: 'UTC',
    scheduleTimezone: 'UTC',
    scheduleTimezoneMismatch: false,
    startInclusive: '2026-08-01T00:00:00.000Z',
    endExclusive: '2026-09-01T00:00:00.000Z',
    countReturned: 0,
    incomplete: false,
    omittedAtLeast: 0,
  },
};
