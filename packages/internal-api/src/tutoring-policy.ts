export const TUTORING_POLICY_CONFIG_ID = 'TUTORING_POLICY';

export interface TutoringTimeRule {
  /** JavaScript weekday: Sunday is 0. */
  weekdays: number[];
  classStartTime: string;
  tutoringStartTime: string;
  durationMinutes: number;
}

export interface TutoringPolicy {
  preset: 'standard' | 'easy_center' | 'custom';
  durationMinutes: number;
  leadMinutes: number;
  weakSupportSessions: number;
  reassessmentDays: number;
  followUpDays: number;
  schedulingHorizonDays: number;
  timeRules: TutoringTimeRule[];
  parentMessageTemplate: string;
}

export const DEFAULT_PARENT_MESSAGE_TEMPLATE =
  'Trung tâm xin gửi lịch kèm {{reason}} của {{student}}: {{time}} ngày {{date}} ({{duration}} phút), lớp {{group}}, giáo viên {{teacher}}. Mong phụ huynh sắp xếp cho con tham gia đúng giờ. Xin cảm ơn.';

export const STANDARD_TUTORING_POLICY: TutoringPolicy = {
  preset: 'standard',
  durationMinutes: 45,
  leadMinutes: 45,
  weakSupportSessions: 1,
  reassessmentDays: 14,
  followUpDays: 7,
  schedulingHorizonDays: 56,
  timeRules: [],
  parentMessageTemplate: DEFAULT_PARENT_MESSAGE_TEMPLATE,
};

export const EASY_CENTER_TUTORING_POLICY: TutoringPolicy = {
  ...STANDARD_TUTORING_POLICY,
  preset: 'easy_center',
  weakSupportSessions: 2,
  // The center's morning weekend class uses a 60-minute session after class.
  timeRules: [
    {
      weekdays: [0, 6],
      classStartTime: '08:00',
      tutoringStartTime: '09:30',
      durationMinutes: 60,
    },
  ],
};

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const FIELDS = [
  'durationMinutes',
  'leadMinutes',
  'weakSupportSessions',
  'reassessmentDays',
  'followUpDays',
  'schedulingHorizonDays',
] as const;

function isIntegerInRange(value: unknown, min: number, max: number) {
  return (
    Number.isInteger(value) && Number(value) >= min && Number(value) <= max
  );
}

/** Strict validation is shared by settings UI and the API write boundary. */
export function parseTutoringPolicy(value: unknown): TutoringPolicy | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (!['standard', 'easy_center', 'custom'].includes(String(candidate.preset)))
    return null;
  for (const field of FIELDS) {
    const min = field === 'leadMinutes' ? 0 : 1;
    const max =
      field === 'schedulingHorizonDays'
        ? 180
        : field === 'leadMinutes'
          ? 480
          : field === 'durationMinutes'
            ? 480
            : field === 'weakSupportSessions'
              ? 6
              : 90;
    if (!isIntegerInRange(candidate[field], min, max)) return null;
  }
  if (
    typeof candidate.parentMessageTemplate !== 'string' ||
    candidate.parentMessageTemplate.trim().length < 1 ||
    candidate.parentMessageTemplate.length > 2000 ||
    !Array.isArray(candidate.timeRules) ||
    candidate.timeRules.length > 30
  )
    return null;

  const rules: TutoringTimeRule[] = [];
  for (const raw of candidate.timeRules) {
    if (!raw || typeof raw !== 'object') return null;
    const rule = raw as Record<string, unknown>;
    if (
      !Array.isArray(rule.weekdays) ||
      rule.weekdays.length < 1 ||
      rule.weekdays.length > 7 ||
      !rule.weekdays.every((day) => isIntegerInRange(day, 0, 6)) ||
      typeof rule.classStartTime !== 'string' ||
      !TIME.test(rule.classStartTime) ||
      typeof rule.tutoringStartTime !== 'string' ||
      !TIME.test(rule.tutoringStartTime) ||
      !isIntegerInRange(rule.durationMinutes, 1, 480)
    )
      return null;
    rules.push({
      weekdays: [...new Set(rule.weekdays as number[])],
      classStartTime: rule.classStartTime,
      tutoringStartTime: rule.tutoringStartTime,
      durationMinutes: rule.durationMinutes as number,
    });
  }

  return {
    preset: candidate.preset as TutoringPolicy['preset'],
    durationMinutes: candidate.durationMinutes as number,
    leadMinutes: candidate.leadMinutes as number,
    weakSupportSessions: candidate.weakSupportSessions as number,
    reassessmentDays: candidate.reassessmentDays as number,
    followUpDays: candidate.followUpDays as number,
    schedulingHorizonDays: candidate.schedulingHorizonDays as number,
    timeRules: rules,
    parentMessageTemplate: candidate.parentMessageTemplate,
  };
}

export function readTutoringPolicy(value: string | null | undefined) {
  if (!value) return STANDARD_TUTORING_POLICY;
  try {
    return parseTutoringPolicy(JSON.parse(value)) ?? STANDARD_TUTORING_POLICY;
  } catch {
    return STANDARD_TUTORING_POLICY;
  }
}

export function renderTutoringParentMessage(
  template: string,
  values: Record<
    'student' | 'reason' | 'date' | 'time' | 'duration' | 'group' | 'teacher',
    string
  >
) {
  return template.replace(
    /\{\{(student|reason|date|time|duration|group|teacher)\}\}/g,
    (_, key: keyof typeof values) => values[key]
  );
}
