import { listEducationTodo } from '@tuturuuu/education-core/todo/service';
import { tulearnAccessErrorResponse } from '@tuturuuu/education-core/tulearn/access';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { normalizeWorkspaceId } from '@tuturuuu/utils/workspace-helper';
import { connection, NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';

const querySchema = z
  .object({
    kind: z
      .enum(['tutoring', 'assignments', 'lessons', 'tests'])
      .default('tutoring'),
    page: z.coerce.number().int().min(1).max(1000000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export const GET = withSessionAuth<{ wsId: string }>(
  async (request, { supabase, user }, { wsId }) => {
    await connection();
    const parsed = querySchema.safeParse(
      Object.fromEntries(request.nextUrl.searchParams)
    );
    // This destination is always the actor's work, never a parent-selected learner.
    if (!parsed.success)
      return NextResponse.json({ message: 'Invalid query' }, { status: 400 });
    try {
      const normalizedWsId = await normalizeWorkspaceId(wsId, supabase);
      const result = await listEducationTodo({
        db: await createAdminClient(),
        wsId: normalizedWsId,
        userId: user.id,
        app: 'learn',
        ...parsed.data,
      });
      return NextResponse.json(result, {
        headers: { 'Cache-Control': 'private, no-store' },
      });
    } catch (error) {
      const access = tulearnAccessErrorResponse(error);
      if (access) return access;
      console.error('Failed to load education to do', error);
      return NextResponse.json(
        { message: 'Failed to load assigned work' },
        { status: 500 }
      );
    }
  },
  { allowAppSessionAuth: true }
);
