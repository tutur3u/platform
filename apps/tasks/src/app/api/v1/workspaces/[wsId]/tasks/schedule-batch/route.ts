import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { connection, NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import {
  readTaskScheduleBatch,
  ScheduleBatchError,
} from '@/lib/calendar/task-schedule-batch';

const input = z.object({
  wsId: z.uuid(),
  taskIds: z.array(z.uuid()).min(1).max(100),
  personal: z.boolean(),
});
export const GET = withSessionAuth<{ wsId: string }>(
  async (request, { user, supabase }, { wsId }) => {
    await connection();
    const query = new URL(request.url).searchParams;
    const parsed = input.safeParse({
      wsId,
      taskIds: query.get('taskIds')?.split(','),
      personal: query.get('personal') === 'true',
    });
    if (!parsed.success)
      return NextResponse.json(
        { error: 'Invalid task schedule batch' },
        { status: 400 }
      );
    try {
      const result = await readTaskScheduleBatch({
        supabase,
        admin: await createAdminClient({ noCookie: true }),
        actorId: user.id,
        ...parsed.data,
        taskIds: [...new Set(parsed.data.taskIds)],
      });
      return NextResponse.json(result, {
        headers: { 'Cache-Control': 'private, no-store' },
      });
    } catch (error) {
      if (error instanceof ScheduleBatchError)
        return NextResponse.json(
          { error: error.message },
          { status: error.status }
        );
      console.error('Failed to read task schedule batch', error);
      return NextResponse.json(
        { error: 'Failed to read task schedules' },
        { status: 500 }
      );
    }
  },
  { allowAppSessionAuth: { targetApp: ['calendar', 'tasks'] } }
);
