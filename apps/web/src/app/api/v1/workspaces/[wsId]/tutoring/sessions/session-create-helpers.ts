import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { NextResponse } from 'next/server';
import type { z } from 'zod';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import {
  parseTimeToMinutes,
  type TutoringSessionCreateSchema,
  type TutoringSessionSlotInput,
} from '../shared';

type TutoringSessionCreatePayload = z.infer<typeof TutoringSessionCreateSchema>;

function addDaysToDateString(dateString: string, days: number) {
  const [year = 0, month = 1, day = 1] = dateString
    .split('-')
    .map((part) => Number.parseInt(part, 10));
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

export function getAdjacentSessionDates(dateString: string) {
  return [
    addDaysToDateString(dateString, -1),
    dateString,
    addDaysToDateString(dateString, 1),
  ];
}

function formatMinutesAsTime(totalMinutes: number) {
  const normalizedMinutes = ((totalMinutes % 1440) + 1440) % 1440;
  const hours = Math.floor(normalizedMinutes / 60);
  const minutes = normalizedMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function buildSequentialSessionSlots({
  durationMinutes,
  sessionCount,
  sessionDate,
  startTime,
  teacherUserId,
}: {
  durationMinutes: number;
  sessionCount: number;
  sessionDate: string;
  startTime: string;
  teacherUserId?: string | null;
}) {
  const baseStartMinutes = parseTimeToMinutes(startTime);

  if (baseStartMinutes === null) {
    return null;
  }

  return Array.from({ length: sessionCount }, (_, index) => {
    const totalStartMinutes = baseStartMinutes + index * durationMinutes;
    const dayOffset = Math.floor(totalStartMinutes / 1440);

    return {
      durationMinutes,
      sessionDate: addDaysToDateString(sessionDate, dayOffset),
      startTime: formatMinutesAsTime(totalStartMinutes),
      teacherUserId: teacherUserId ?? null,
    };
  });
}

export function buildTutoringSessionSlots(
  payload: TutoringSessionCreatePayload
) {
  if (payload.sessions && payload.sessions.length > 0) {
    return payload.sessions.map((slot) => ({
      ...slot,
      teacherUserId: slot.teacherUserId ?? payload.teacherUserId ?? null,
    }));
  }

  if (!(payload.sessionDate && payload.startTime)) {
    return null;
  }

  return buildSequentialSessionSlots({
    durationMinutes: payload.durationMinutes,
    sessionCount: payload.sessionCount,
    sessionDate: payload.sessionDate,
    startTime: payload.startTime,
    teacherUserId: payload.teacherUserId ?? null,
  });
}

export async function validateTutoringSessionScope({
  normalizedWsId,
  payload,
  supabase,
}: {
  normalizedWsId: string;
  payload: TutoringSessionCreatePayload;
  supabase: TypedSupabaseClient;
}) {
  const { data: group, error: groupError } = await supabase
    .from('workspace_user_groups')
    .select('id')
    .eq('id', payload.groupId)
    .eq('ws_id', normalizedWsId)
    .maybeSingle();

  if (groupError) {
    serverLogger.error('Failed to validate tutoring group ownership', {
      error: groupError,
      groupId: payload.groupId,
      wsId: normalizedWsId,
    });

    return NextResponse.json(
      { message: 'Failed to validate group' },
      { status: 500 }
    );
  }

  if (!group) {
    return NextResponse.json({ message: 'Group not found' }, { status: 404 });
  }

  const { data: student, error: studentError } = await supabase
    .from('workspace_users')
    .select('id')
    .eq('id', payload.studentUserId)
    .eq('ws_id', normalizedWsId)
    .maybeSingle();

  if (studentError) {
    serverLogger.error('Failed to validate tutoring student ownership', {
      error: studentError,
      studentUserId: payload.studentUserId,
      wsId: normalizedWsId,
    });

    return NextResponse.json(
      { message: 'Failed to validate student' },
      { status: 500 }
    );
  }

  if (!student) {
    return NextResponse.json({ message: 'Student not found' }, { status: 404 });
  }

  const { data: groupStudent, error: groupStudentError } = await supabase
    .from('workspace_user_groups_users')
    .select('group_id,user_id')
    .eq('group_id', payload.groupId)
    .eq('user_id', payload.studentUserId)
    .maybeSingle();

  if (groupStudentError) {
    serverLogger.error('Failed to validate tutoring student group membership', {
      error: groupStudentError,
      groupId: payload.groupId,
      studentUserId: payload.studentUserId,
      wsId: normalizedWsId,
    });

    return NextResponse.json(
      { message: 'Failed to validate student group membership' },
      { status: 500 }
    );
  }

  if (!groupStudent) {
    return NextResponse.json(
      { message: 'Student must belong to the selected group' },
      { status: 400 }
    );
  }

  if (!payload.sourceFeedbackId) {
    return null;
  }

  const { data: feedback, error: feedbackError } = await supabase
    .from('user_feedbacks')
    .select(
      'id,group_id,user_id,user:workspace_users!user_feedbacks_user_id_fkey!inner(ws_id)'
    )
    .eq('id', payload.sourceFeedbackId)
    .eq('group_id', payload.groupId)
    .eq('user_id', payload.studentUserId)
    .eq('user.ws_id', normalizedWsId)
    .maybeSingle();

  if (feedbackError) {
    serverLogger.error('Failed to validate tutoring source feedback', {
      error: feedbackError,
      sourceFeedbackId: payload.sourceFeedbackId,
      wsId: normalizedWsId,
    });

    return NextResponse.json(
      { message: 'Failed to validate source feedback' },
      { status: 500 }
    );
  }

  if (!feedback) {
    return NextResponse.json(
      { message: 'Source feedback does not match the selected student' },
      { status: 400 }
    );
  }

  return null;
}

export async function listGroupTeacherIds({
  groupId,
  normalizedWsId,
  sbAdmin,
  teacherUserIds,
}: {
  groupId: string;
  normalizedWsId: string;
  sbAdmin: TypedSupabaseClient;
  teacherUserIds: string[];
}) {
  if (teacherUserIds.length === 0) {
    return { teacherIds: new Set<string>(), error: null };
  }

  const { data, error } = await sbAdmin
    .from('workspace_user_groups_users')
    .select(
      'user_id,user:workspace_users!workspace_user_roles_users_user_id_fkey!inner(ws_id)'
    )
    .eq('group_id', groupId)
    .in('user_id', teacherUserIds)
    .eq('role', 'TEACHER')
    .eq('user.ws_id', normalizedWsId);

  if (error) {
    return { teacherIds: new Set<string>(), error };
  }

  return {
    teacherIds: new Set((data ?? []).map((row) => row.user_id).filter(Boolean)),
    error: null,
  };
}

export async function listPotentialSchedulingConflicts({
  normalizedWsId,
  sbAdmin,
  slots,
}: {
  normalizedWsId: string;
  sbAdmin: TypedSupabaseClient;
  slots: TutoringSessionSlotInput[];
}) {
  const sessionDates = [
    ...new Set(
      slots.flatMap((slot) => getAdjacentSessionDates(slot.sessionDate))
    ),
  ];
  const teacherIds = [
    ...new Set(
      slots
        .map((slot) => slot.teacherUserId)
        .filter((teacherUserId): teacherUserId is string =>
          Boolean(teacherUserId)
        )
    ),
  ];
  const studentIds = [...new Set(slots.map((slot) => slot.studentUserId))];

  if (sessionDates.length === 0) {
    return { data: [], error: null };
  }

  const tutoringSessionsClient = sbAdmin.schema('private');
  const teacherQuery =
    teacherIds.length > 0
      ? tutoringSessionsClient
          .from('workspace_tutoring_sessions')
          .select(
            'id,session_date,start_time,duration_minutes,teacher_user_id,student_user_id'
          )
          .eq('ws_id', normalizedWsId)
          .in('session_date', sessionDates)
          .in('teacher_user_id', teacherIds)
      : Promise.resolve({ data: [], error: null });

  const studentQuery = tutoringSessionsClient
    .from('workspace_tutoring_sessions')
    .select(
      'id,session_date,start_time,duration_minutes,teacher_user_id,student_user_id'
    )
    .eq('ws_id', normalizedWsId)
    .in('session_date', sessionDates)
    .in('student_user_id', studentIds);

  const [teacherResult, studentResult] = await Promise.all([
    teacherQuery,
    studentQuery,
  ]);

  if (teacherResult.error) {
    return { data: [], error: teacherResult.error };
  }

  if (studentResult.error) {
    return { data: [], error: studentResult.error };
  }

  const merged = new Map<string, (typeof studentResult.data)[number]>();
  for (const row of teacherResult.data ?? []) {
    merged.set(row.id, row);
  }
  for (const row of studentResult.data ?? []) {
    merged.set(row.id, row);
  }

  return {
    data: [...merged.values()],
    error: null,
  };
}
