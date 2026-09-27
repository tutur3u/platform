export const TUTORING_POLICY_CONFIG_ID = 'TUTORING_POLICY';
export const TUTORING_POLICY_PART_PREFIX = 'TUTORING_POLICY_PART_';
const CONFIG_VALUE_LIMIT = 900;

export interface TutoringTimeRule {
  /** JavaScript weekday: Sunday is 0. */
  weekdays: number[];
  classStartTime: string;
  tutoringStartTime: string;
  durationMinutes: number;
  label?: string;
}

export interface TutoringPolicy {
  preset: 'standard' | 'easy_center' | 'custom';
  durationMinutes: number;
  leadMinutes: number;
  weakSupportSessions: number;
  absenceLookbackDays: number;
  reassessmentDays: number;
  followUpDays: number;
  schedulingHorizonDays: number;
  timeRules: TutoringTimeRule[];
  campusByGroupId: Record<string, string>;
  parentMessageTemplate: string;
}

export const DEFAULT_PARENT_MESSAGE_TEMPLATE =
  'Trung tâm xin gửi lịch kèm {{reason}} của {{student}}: {{time}} ngày {{date}} ({{duration}} phút), lớp {{group}}, giáo viên {{teacher}}. Mong phụ huynh sắp xếp cho con tham gia đúng giờ. Xin cảm ơn.';

export const EASY_CENTER_PARENT_MESSAGE_TEMPLATE =
  'Trung tâm EASY xin được xếp lịch kèm cho bạn {{student}} như sau:\n• Giờ kèm: {{time}}\n• Ngày: {{date}}\n• Cơ sở: {{campus}}\nMong phụ huynh thu xếp cho con tham gia đúng giờ. Trân trọng.';

export const STANDARD_TUTORING_POLICY: TutoringPolicy = {
  preset: 'standard',
  durationMinutes: 45,
  leadMinutes: 45,
  weakSupportSessions: 1,
  absenceLookbackDays: 28,
  reassessmentDays: 14,
  followUpDays: 7,
  schedulingHorizonDays: 56,
  timeRules: [],
  campusByGroupId: {},
  parentMessageTemplate: DEFAULT_PARENT_MESSAGE_TEMPLATE,
};

export const EASY_CENTER_TUTORING_POLICY: TutoringPolicy = {
  ...STANDARD_TUTORING_POLICY,
  preset: 'easy_center',
  weakSupportSessions: 2,
  absenceLookbackDays: 21,
  parentMessageTemplate: EASY_CENTER_PARENT_MESSAGE_TEMPLATE,
  // The seven class shifts supplied by Easy Center. Shift 4 is after class.
  timeRules: [
    {
      label: 'Shift 1',
      weekdays: [1, 3, 5],
      classStartTime: '18:00',
      tutoringStartTime: '17:15',
      durationMinutes: 45,
    },
    {
      label: 'Shift 2',
      weekdays: [2, 4],
      classStartTime: '18:00',
      tutoringStartTime: '17:15',
      durationMinutes: 45,
    },
    {
      label: 'Shift 4',
      weekdays: [0, 6],
      classStartTime: '08:00',
      tutoringStartTime: '09:30',
      durationMinutes: 50,
    },
    {
      label: 'Shift 3',
      weekdays: [0, 6],
      classStartTime: '09:30',
      tutoringStartTime: '08:45',
      durationMinutes: 45,
    },
    {
      label: 'Shift 5',
      weekdays: [0, 6],
      classStartTime: '16:00',
      tutoringStartTime: '15:15',
      durationMinutes: 45,
    },
    {
      label: 'Shift 6',
      weekdays: [0, 6],
      classStartTime: '17:30',
      tutoringStartTime: '16:45',
      durationMinutes: 45,
    },
    {
      label: 'Shift 7',
      weekdays: [0, 6],
      classStartTime: '18:00',
      tutoringStartTime: '17:15',
      durationMinutes: 45,
    },
  ],
};

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const FIELDS = [
  'durationMinutes',
  'leadMinutes',
  'weakSupportSessions',
  'absenceLookbackDays',
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
        : field === 'absenceLookbackDays'
          ? 365
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
    candidate.timeRules.length > 30 ||
    !candidate.campusByGroupId ||
    typeof candidate.campusByGroupId !== 'object' ||
    Array.isArray(candidate.campusByGroupId)
  )
    return null;

  const campusEntries = Object.entries(candidate.campusByGroupId);
  if (
    campusEntries.length > 500 ||
    campusEntries.some(
      ([groupId, name]) =>
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          groupId
        ) ||
        typeof name !== 'string' ||
        name.trim().length < 1 ||
        name.length > 80
    )
  )
    return null;

  const rules: TutoringTimeRule[] = [];
  const occupiedClassTimes = new Set<string>();
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
      !isIntegerInRange(rule.durationMinutes, 1, 480) ||
      (rule.label !== undefined &&
        (typeof rule.label !== 'string' || rule.label.length > 50))
    )
      return null;
    for (const weekday of rule.weekdays as number[]) {
      const key = `${weekday}:${rule.classStartTime}`;
      if (occupiedClassTimes.has(key)) return null;
      occupiedClassTimes.add(key);
    }
    rules.push({
      weekdays: [...new Set(rule.weekdays as number[])],
      classStartTime: rule.classStartTime,
      tutoringStartTime: rule.tutoringStartTime,
      durationMinutes: rule.durationMinutes as number,
      ...(typeof rule.label === 'string' && rule.label.trim()
        ? { label: rule.label.trim() }
        : {}),
    });
  }

  return {
    preset: candidate.preset as TutoringPolicy['preset'],
    durationMinutes: candidate.durationMinutes as number,
    leadMinutes: candidate.leadMinutes as number,
    weakSupportSessions: candidate.weakSupportSessions as number,
    absenceLookbackDays: candidate.absenceLookbackDays as number,
    reassessmentDays: candidate.reassessmentDays as number,
    followUpDays: candidate.followUpDays as number,
    schedulingHorizonDays: candidate.schedulingHorizonDays as number,
    timeRules: rules,
    campusByGroupId: Object.fromEntries(
      campusEntries.map(([groupId, name]) => [groupId, String(name).trim()])
    ),
    parentMessageTemplate: candidate.parentMessageTemplate,
  };
}

export function getTutoringShiftLabel(
  policy: TutoringPolicy,
  sessionDate: string,
  startTime: string
) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) return null;
  const weekday = new Date(`${sessionDate}T12:00:00Z`).getUTCDay();
  return (
    policy.timeRules.find(
      (rule) =>
        rule.weekdays.includes(weekday) &&
        rule.tutoringStartTime === startTime.slice(0, 5)
    )?.label ?? null
  );
}

export function getTutoringCampus(
  policy: TutoringPolicy,
  groupId: string,
  groupName: string | null | undefined
) {
  const override = policy.campusByGroupId[groupId];
  if (override) return override;
  const match = groupName?.match(
    /(?:^|[\s(/-])(?:CS|CƠ SỞ)\s*[-:]?\s*([12])(?=$|[\s)/-])/i
  );
  return match ? `CS${match[1]}` : null;
}

export function readTutoringPolicy(value: string | null | undefined) {
  if (!value) return STANDARD_TUTORING_POLICY;
  try {
    return parseTutoringPolicy(JSON.parse(value)) ?? STANDARD_TUTORING_POLICY;
  } catch {
    return STANDARD_TUTORING_POLICY;
  }
}

export interface TutoringPolicyConfigRow {
  id: string;
  value: string;
}

/** Each workspace config value is limited to 1,000 characters in production. */
export function serializeTutoringPolicyConfigRows(policy: TutoringPolicy) {
  const json = JSON.stringify(policy);
  const chunks: TutoringPolicyConfigRow[] = [];
  for (let index = 0; index < json.length; ) {
    let end = Math.min(index + CONFIG_VALUE_LIMIT, json.length);
    const lastCodeUnit = json.charCodeAt(end - 1);
    if (end < json.length && lastCodeUnit >= 0xd800 && lastCodeUnit <= 0xdbff)
      end -= 1;
    chunks.push({
      id: `${TUTORING_POLICY_PART_PREFIX}${chunks.length}`,
      value: json.slice(index, end),
    });
    index = end;
  }
  return [
    {
      id: TUTORING_POLICY_CONFIG_ID,
      value: JSON.stringify({
        format: 'chunks-v1',
        parts: chunks.length,
        reassessmentDays: policy.reassessmentDays,
        absenceLookbackDays: policy.absenceLookbackDays,
      }),
    },
    ...chunks,
  ];
}

export function readTutoringPolicyConfigRows(rows: TutoringPolicyConfigRow[]) {
  const values = new Map(rows.map((row) => [row.id, row.value]));
  const base = values.get(TUTORING_POLICY_CONFIG_ID);
  if (!base) return STANDARD_TUTORING_POLICY;
  try {
    const marker: unknown = JSON.parse(base);
    if (
      marker &&
      typeof marker === 'object' &&
      'format' in marker &&
      marker.format === 'chunks-v1' &&
      'parts' in marker &&
      Number.isInteger(marker.parts) &&
      Number(marker.parts) >= 1 &&
      Number(marker.parts) <= 100
    ) {
      const chunks = Array.from({ length: Number(marker.parts) }, (_, index) =>
        values.get(`${TUTORING_POLICY_PART_PREFIX}${index}`)
      );
      if (chunks.some((chunk) => chunk === undefined))
        return STANDARD_TUTORING_POLICY;
      return readTutoringPolicy(chunks.join(''));
    }
  } catch {
    return STANDARD_TUTORING_POLICY;
  }
  return readTutoringPolicy(base);
}

export function renderTutoringParentMessage(
  template: string,
  values: Record<
    | 'student'
    | 'reason'
    | 'date'
    | 'time'
    | 'duration'
    | 'group'
    | 'teacher'
    | 'campus',
    string
  >
) {
  return template.replace(
    /\{\{(student|reason|date|time|duration|group|teacher|campus)\}\}/g,
    (_, key: keyof typeof values) => values[key]
  );
}
