import {
  readTutoringPolicyConfigRows,
  TUTORING_POLICY_CONFIG_ID,
} from '@tuturuuu/internal-api/tutoring-policy';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { buildPostgrestIlikeOrFilter } from '@tuturuuu/utils/postgrest-filter';
import { connection, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveTutoringRouteAccess } from '@/lib/tutoring/route-access';
import {
  classifyWorkspaceTeacher,
  listWorkspaceTutorIds,
  workspaceTeachersQuery,
} from '@/lib/tutoring/teachers';

const querySchema = z.object({
  page: z.coerce.number().int().min(1).max(1000000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(200).default(''),
  tutorsOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true')),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  await connection();
  const { wsId } = await params;
  const { normalizedWsId, permissions } = await resolveTutoringRouteAccess(
    request,
    wsId
  );
  if (!permissions)
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (permissions.withoutPermission('view_user_groups'))
    return NextResponse.json(
      { message: 'Insufficient permissions' },
      { status: 403 }
    );
  const parsed = querySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams)
  );
  if (!parsed.success)
    return NextResponse.json({ message: 'Invalid query' }, { status: 400 });
  const { page, pageSize, q, tutorsOnly } = parsed.data;
  const sbAdmin = await createAdminClient();
  const { data: policyRows, error: policyError } = await sbAdmin
    .from('workspace_configs')
    .select('id,value')
    .eq('ws_id', normalizedWsId)
    .like('id', `${TUTORING_POLICY_CONFIG_ID}%`);
  if (policyError) {
    console.error('Failed to load tutoring policy for teachers', {
      error: policyError,
      wsId: normalizedWsId,
    });
    // Default listings depend on policy to determine eligibility.
    if (tutorsOnly !== false)
      return NextResponse.json(
        { message: 'Failed to load teachers' },
        { status: 500 }
      );
  }
  const { tutorGroupIds } = readTutoringPolicyConfigRows(
    policyError ? [] : (policyRows ?? [])
  );
  let query = workspaceTeachersQuery(sbAdmin, normalizedWsId);
  if (tutorsOnly ?? tutorGroupIds.length > 0) {
    const { tutorIds, error } = await listWorkspaceTutorIds({
      normalizedWsId,
      sbAdmin,
      tutorGroupIds,
    });
    if (error) {
      console.error('Failed to list tutoring tutors', {
        error,
        wsId: normalizedWsId,
      });
      return NextResponse.json(
        { message: 'Failed to load teachers' },
        { status: 500 }
      );
    }
    // Filtering by group would also trim each person's embedded memberships,
    // hiding their class roles, so narrow by user id instead.
    query = query.in('id', tutorIds);
  }
  if (q) {
    // Quoted PostgREST literals keep punctuation inside the search operand.
    query = query.or(
      buildPostgrestIlikeOrFilter(['full_name', 'display_name'], q)
    );
  }
  const { data, error, count } = await query
    .order('full_name', { ascending: true, nullsFirst: false })
    .order('id', { ascending: true })
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (error) {
    console.error('Failed to list tutoring teachers', {
      error,
      wsId: normalizedWsId,
    });
    return NextResponse.json(
      { message: 'Failed to load teachers' },
      { status: 500 }
    );
  }
  return NextResponse.json(
    {
      data: (data ?? []).map(
        ({ id, full_name, display_name, memberships }) => ({
          id,
          full_name,
          display_name,
          ...classifyWorkspaceTeacher(memberships ?? [], tutorGroupIds),
        })
      ),
      count: count ?? 0,
      page,
      pageSize,
      totalPages: Math.ceil((count ?? 0) / pageSize),
    },
    { headers: { 'Cache-Control': 'private, no-store' } }
  );
}
