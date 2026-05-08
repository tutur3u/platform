import { z } from 'zod';

export const TutoringReasonTypeSchema = z.enum([
  'ABSENT_RECOVERY',
  'WEAK_SUPPORT',
  'CUSTOM',
]);

export const TutoringAttendanceStatusSchema = z.enum([
  'PENDING',
  'DONE',
  'NO_SHOW',
  'CANCELLED',
]);

export const TutoringSessionCreateSchema = z.object({
  groupId: z.string().uuid(),
  studentUserId: z.string().uuid(),
  teacherUserId: z.string().uuid().nullable().optional(),
  sessions: z
    .array(
      z.object({
        sessionDate: z.string().date(),
        startTime: z
          .string()
          .regex(
            /^\d{1,2}:\d{2}(?::\d{2})?(?:\s?(?:AM|PM|am|pm))?$/,
            'Invalid time format'
          ),
        durationMinutes: z.number().int().positive().max(480).default(45),
        teacherUserId: z.string().uuid().nullable().optional(),
      })
    )
    .min(1)
    .max(50)
    .optional(),
  sessionDate: z.string().date().optional(),
  startTime: z
    .string()
    .regex(
      /^\d{1,2}:\d{2}(?::\d{2})?(?:\s?(?:AM|PM|am|pm))?$/,
      'Invalid time format'
    )
    .optional(),
  durationMinutes: z.number().int().positive().max(480).default(45),
  sessionCount: z.number().int().positive().max(50).default(1),
  reasonType: TutoringReasonTypeSchema,
  reasonDetail: z.string().max(5000).default(''),
  content: z.string().max(10000).default(''),
  attendanceStatus: TutoringAttendanceStatusSchema.default('PENDING'),
  sourceFeedbackId: z.string().uuid().nullable().optional(),
});

export const TutoringSessionUpdateSchema = z
  .object({
    teacherUserId: z.string().uuid().nullable().optional(),
    sessionDate: z.string().date().optional(),
    startTime: z
      .string()
      .regex(
        /^\d{1,2}:\d{2}(?::\d{2})?(?:\s?(?:AM|PM|am|pm))?$/,
        'Invalid time format'
      )
      .optional(),
    durationMinutes: z.number().int().positive().max(480).optional(),
    reasonType: TutoringReasonTypeSchema.optional(),
    reasonDetail: z.string().max(5000).optional(),
    content: z.string().max(10000).optional(),
    attendanceStatus: TutoringAttendanceStatusSchema.optional(),
    parentMessagePreview: z.string().max(10000).optional(),
    resolvedAt: z.string().datetime({ offset: true }).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  });

export const TutoringSessionListQuerySchema = z.object({
  fromDate: z.string().date().optional(),
  toDate: z.string().date().optional(),
  teacherId: z.string().uuid().optional(),
  groupId: z.string().uuid().optional(),
  studentUserId: z.string().uuid().optional(),
  reasonType: TutoringReasonTypeSchema.optional(),
  attendanceStatus: TutoringAttendanceStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const TutoringQueueQuerySchema = z.object({
  groupId: z.string().uuid().optional(),
  studentUserId: z.string().uuid().optional(),
  reasonType: z.enum(['ABSENT_RECOVERY', 'WEAK_SUPPORT', 'BOTH']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const TutoringMarkSchema = z.object({
  attendanceStatus: TutoringAttendanceStatusSchema,
});

export interface TutoringSessionSlotInput {
  sessionDate: string;
  startTime: string;
  durationMinutes: number;
  teacherUserId?: string | null;
  studentUserId: string;
}

export interface TutoringSessionConflict {
  sessionDate: string;
  startTime: string;
  durationMinutes: number;
  conflictType: 'teacher' | 'student';
  conflictWithId?: string;
  teacherUserId?: string | null;
  studentUserId: string;
}

function parseTimeToMinutes(time: string) {
  const normalized = time.trim();
  const meridiemMatch = normalized.match(/\s?(AM|PM)$/i);
  const meridiem = meridiemMatch?.[1]?.toUpperCase();
  const timePart = meridiem
    ? normalized.slice(0, meridiemMatch?.index ?? normalized.length).trim()
    : normalized;
  const [rawHour = '0', rawMinute = '0'] = timePart.split(':');
  let hour = Number.parseInt(rawHour, 10);
  const minute = Number.parseInt(rawMinute, 10);

  if (Number.isNaN(hour) || Number.isNaN(minute) || minute < 0 || minute > 59) {
    return null;
  }

  if (meridiem) {
    if (hour < 1 || hour > 12) {
      return null;
    }

    if (meridiem === 'AM') {
      hour = hour % 12;
    } else {
      hour = (hour % 12) + 12;
    }
  } else if (hour < 0 || hour > 23) {
    return null;
  }

  return hour * 60 + minute;
}

function rangesOverlap(
  startA: number,
  durationA: number,
  startB: number,
  durationB: number
) {
  const endA = startA + durationA;
  const endB = startB + durationB;
  return startA < endB && startB < endA;
}

function toComparableSlot<T extends TutoringSessionSlotInput>(slot: T) {
  const startMinutes = parseTimeToMinutes(slot.startTime);
  if (startMinutes === null) {
    return null;
  }

  return {
    ...slot,
    startMinutes,
  };
}

export function findConflictsWithinSlots(slots: TutoringSessionSlotInput[]) {
  const conflicts: TutoringSessionConflict[] = [];
  const normalized = slots
    .map((slot) => toComparableSlot(slot))
    .filter((slot): slot is NonNullable<typeof slot> => Boolean(slot));

  for (let i = 0; i < normalized.length; i += 1) {
    const current = normalized[i];
    if (!current) continue;

    for (let j = i + 1; j < normalized.length; j += 1) {
      const candidate = normalized[j];
      if (!candidate) continue;

      if (current.sessionDate !== candidate.sessionDate) {
        continue;
      }

      if (
        !rangesOverlap(
          current.startMinutes,
          current.durationMinutes,
          candidate.startMinutes,
          candidate.durationMinutes
        )
      ) {
        continue;
      }

      if (
        current.teacherUserId &&
        candidate.teacherUserId &&
        current.teacherUserId === candidate.teacherUserId
      ) {
        conflicts.push({
          conflictType: 'teacher',
          durationMinutes: candidate.durationMinutes,
          sessionDate: candidate.sessionDate,
          startTime: candidate.startTime,
          studentUserId: candidate.studentUserId,
          teacherUserId: candidate.teacherUserId,
        });
      }

      if (current.studentUserId === candidate.studentUserId) {
        conflicts.push({
          conflictType: 'student',
          durationMinutes: candidate.durationMinutes,
          sessionDate: candidate.sessionDate,
          startTime: candidate.startTime,
          studentUserId: candidate.studentUserId,
          teacherUserId: candidate.teacherUserId,
        });
      }
    }
  }

  return conflicts;
}

interface ExistingTutoringSession {
  id: string;
  session_date: string;
  start_time: string;
  duration_minutes: number;
  teacher_user_id: string | null;
  student_user_id: string;
}

export function findConflictsWithExistingSessions(
  incomingSlots: TutoringSessionSlotInput[],
  existingSessions: ExistingTutoringSession[]
) {
  const conflicts: TutoringSessionConflict[] = [];
  const normalizedIncoming = incomingSlots
    .map((slot) => toComparableSlot(slot))
    .filter((slot): slot is NonNullable<typeof slot> => Boolean(slot));
  const normalizedExisting = existingSessions
    .map((session) => {
      const normalized = toComparableSlot({
        durationMinutes: session.duration_minutes,
        sessionDate: session.session_date,
        startTime: session.start_time,
        studentUserId: session.student_user_id,
        teacherUserId: session.teacher_user_id,
      });

      if (!normalized) {
        return null;
      }

      return {
        normalized,
        raw: session,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  for (const incoming of normalizedIncoming) {
    for (const existingEntry of normalizedExisting) {
      const existing = existingEntry.normalized;
      const existingRaw = existingEntry.raw;

      if (incoming.sessionDate !== existing.sessionDate) {
        continue;
      }

      if (
        !rangesOverlap(
          incoming.startMinutes,
          incoming.durationMinutes,
          existing.startMinutes,
          existing.durationMinutes
        )
      ) {
        continue;
      }

      if (
        incoming.teacherUserId &&
        existing.teacherUserId &&
        incoming.teacherUserId === existing.teacherUserId
      ) {
        conflicts.push({
          conflictType: 'teacher',
          conflictWithId: existingRaw.id,
          durationMinutes: incoming.durationMinutes,
          sessionDate: incoming.sessionDate,
          startTime: incoming.startTime,
          studentUserId: incoming.studentUserId,
          teacherUserId: incoming.teacherUserId,
        });
        continue;
      }

      if (incoming.studentUserId === existing.studentUserId) {
        conflicts.push({
          conflictType: 'student',
          conflictWithId: existingRaw.id,
          durationMinutes: incoming.durationMinutes,
          sessionDate: incoming.sessionDate,
          startTime: incoming.startTime,
          studentUserId: incoming.studentUserId,
          teacherUserId: incoming.teacherUserId,
        });
      }
    }
  }

  return conflicts;
}
