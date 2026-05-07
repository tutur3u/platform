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
        startTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
        durationMinutes: z.number().int().positive().max(480).default(45),
      })
    )
    .min(1)
    .max(50)
    .optional(),
  sessionDate: z.string().date().optional(),
  startTime: z
    .string()
    .regex(/^\d{2}:\d{2}(:\d{2})?$/)
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
      .regex(/^\d{2}:\d{2}(:\d{2})?$/)
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
