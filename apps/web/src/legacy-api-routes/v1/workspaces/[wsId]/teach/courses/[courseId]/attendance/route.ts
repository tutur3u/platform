import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import {
  requireTeachWorkspaceAccess,
  validateTeachCourse,
} from '@/lib/teach/api';

const RouteParamsSchema = z.object({
  courseId: z.guid(),
  wsId: z.string().min(1),
});

const AttendanceSchema = z.object({
  date: z.string().date(),
  notes: z.string().optional(),
  status: z.enum(['PRESENT', 'ABSENT', 'LATE', 'NONE']),
  user_id: z.guid(),
});

const BatchAttendanceSchema = z.array(AttendanceSchema).max(300);
const DateSchema = z.string().date();
const MonthSchema = z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])$/);

function getMonthBounds(month: string) {
  const [yearValue, monthValue] = month.split('-');
  const year = Number(yearValue);
  const monthIndex = Number(monthValue) - 1;
  const start = new Date(Date.UTC(year, monthIndex, 1));
  const end = new Date(Date.UTC(year, monthIndex + 1, 1));

  return {
    endDate: end.toISOString().slice(0, 10),
    startDate: start.toISOString().slice(0, 10),
  };
}

export const GET = withSessionAuth(
  async (
    request,
    context,
    params:
      | { wsId: string; courseId: string }
      | Promise<{ wsId: string; courseId: string }>
  ) => {
    const parsedParams = RouteParamsSchema.safeParse(await params);
    if (!parsedParams.success) {
      return NextResponse.json(
        { message: 'Invalid route params', errors: parsedParams.error.issues },
        { status: 400 }
      );
    }

    const date = request.nextUrl.searchParams.get('date');
    const month = request.nextUrl.searchParams.get('month');

    let parsedDate: string | null = null;
    if (date) {
      const result = DateSchema.safeParse(date);
      if (!result.success) {
        return NextResponse.json({ message: 'Invalid date' }, { status: 400 });
      }
      parsedDate = result.data;
    }

    let parsedMonth: string | null = null;
    if (month) {
      const result = MonthSchema.safeParse(month);
      if (!result.success) {
        return NextResponse.json({ message: 'Invalid month' }, { status: 400 });
      }
      parsedMonth = result.data;
    }

    if (!parsedDate && !parsedMonth) {
      return NextResponse.json(
        { message: 'Date or month is required' },
        { status: 400 }
      );
    }

    const access = await requireTeachWorkspaceAccess({
      context,
      permission: 'view_user_groups',
      wsId: parsedParams.data.wsId,
    });
    if (access instanceof NextResponse) return access;

    const course = await validateTeachCourse({
      courseId: parsedParams.data.courseId,
      db: access.sbAdmin,
      wsId: access.normalizedWsId,
    });
    if (!course) {
      return NextResponse.json(
        { message: 'Course not found' },
        { status: 404 }
      );
    }

    if (parsedMonth) {
      const { endDate, startDate } = getMonthBounds(parsedMonth);
      const { data, error } = await access.sbAdmin
        .from('user_group_attendance')
        .select('date, notes, status, user_id')
        .eq('group_id', parsedParams.data.courseId)
        .gte('date', startDate)
        .lt('date', endDate);

      if (error) {
        console.error('Failed to fetch Teach attendance month', {
          error,
        });
        return NextResponse.json(
          { message: 'Error fetching attendance' },
          { status: 500 }
        );
      }

      const days = new Map<
        string,
        {
          absent: number;
          date: string;
          late: number;
          notes: number;
          present: number;
          totalMarked: number;
        }
      >();

      for (const entry of data ?? []) {
        const current = days.get(entry.date) ?? {
          absent: 0,
          date: entry.date,
          late: 0,
          notes: 0,
          present: 0,
          totalMarked: 0,
        };
        if (entry.status === 'PRESENT') current.present += 1;
        if (entry.status === 'ABSENT') current.absent += 1;
        if (entry.status === 'LATE') current.late += 1;
        if (entry.notes?.trim()) current.notes += 1;
        current.totalMarked += 1;
        days.set(entry.date, current);
      }

      return NextResponse.json({
        days: Array.from(days.values()).sort((a, b) =>
          a.date.localeCompare(b.date)
        ),
      });
    }

    const { data, error } = await access.sbAdmin
      .from('user_group_attendance')
      .select('date, notes, status, user_id')
      .eq('group_id', parsedParams.data.courseId)
      .eq('date', parsedDate ?? '');

    if (error) {
      console.error('Failed to fetch Teach attendance', { error });
      return NextResponse.json(
        { message: 'Error fetching attendance' },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: data ?? [] });
  },
  {
    allowAppSessionAuth: { targetApp: 'teach' },
    rateLimit: { maxRequests: 120, windowMs: 60000 },
  }
);

export const POST = withSessionAuth(
  async (
    request,
    context,
    params:
      | { wsId: string; courseId: string }
      | Promise<{ wsId: string; courseId: string }>
  ) => {
    const parsedParams = RouteParamsSchema.safeParse(await params);
    if (!parsedParams.success) {
      return NextResponse.json(
        { message: 'Invalid route params', errors: parsedParams.error.issues },
        { status: 400 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { message: 'Invalid request body' },
        { status: 400 }
      );
    }

    const parsedBody = BatchAttendanceSchema.safeParse(body);
    if (!parsedBody.success) {
      return NextResponse.json(
        { message: 'Invalid request body', errors: parsedBody.error.issues },
        { status: 400 }
      );
    }

    const access = await requireTeachWorkspaceAccess({
      context,
      permission: 'check_user_attendance',
      wsId: parsedParams.data.wsId,
    });
    if (access instanceof NextResponse) return access;

    const course = await validateTeachCourse({
      courseId: parsedParams.data.courseId,
      db: access.sbAdmin,
      wsId: access.normalizedWsId,
    });
    if (!course) {
      return NextResponse.json(
        { message: 'Course not found' },
        { status: 404 }
      );
    }

    const date = parsedBody.data[0]?.date;
    if (!date) {
      return NextResponse.json(
        { message: 'Date is required' },
        { status: 400 }
      );
    }

    const toDelete = parsedBody.data
      .filter((entry) => entry.status === 'NONE')
      .map((entry) => entry.user_id);
    const toUpsert = parsedBody.data
      .filter((entry) => entry.status !== 'NONE')
      .map((entry) => ({
        date: entry.date,
        group_id: parsedParams.data.courseId,
        notes: entry.notes ?? '',
        status: entry.status,
        user_id: entry.user_id,
      }));

    if (toDelete.length) {
      const { error } = await access.sbAdmin
        .from('user_group_attendance')
        .delete()
        .eq('group_id', parsedParams.data.courseId)
        .eq('date', date)
        .in('user_id', toDelete);

      if (error) {
        console.error('Failed to delete Teach attendance', { error });
        return NextResponse.json(
          { message: 'Error deleting attendance' },
          { status: 500 }
        );
      }
    }

    if (toUpsert.length) {
      const { error } = await access.sbAdmin
        .from('user_group_attendance')
        .upsert(toUpsert);

      if (error) {
        console.error('Failed to save Teach attendance', { error });
        return NextResponse.json(
          { message: 'Error saving attendance' },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ message: 'success' });
  },
  {
    allowAppSessionAuth: { targetApp: 'teach' },
    rateLimit: { maxRequests: 60, windowMs: 60000 },
  }
);
