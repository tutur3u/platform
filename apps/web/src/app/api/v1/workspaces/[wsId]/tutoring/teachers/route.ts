import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { connection, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveTutoringRouteAccess } from '@/lib/tutoring/route-access';
import { workspaceTeachersQuery } from '@/lib/tutoring/teachers';

const querySchema = z.object({
  page: z.coerce.number().int().min(1).max(1000000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(200).default(''),
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
  const { page, pageSize, q } = parsed.data;
  const sbAdmin = await createAdminClient();
  let query = workspaceTeachersQuery(sbAdmin, normalizedWsId);
  if (q) {
    // Quoted PostgREST literals keep punctuation inside the search operand.
    const pattern = `%${q.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')}%`;
    const literal = `"${pattern.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    query = query.or(
      `full_name.ilike.${literal},display_name.ilike.${literal}`
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
      data: (data ?? []).map(({ id, full_name, display_name }) => ({
        id,
        full_name,
        display_name,
      })),
      count: count ?? 0,
      page,
      pageSize,
      totalPages: Math.ceil((count ?? 0) / pageSize),
    },
    { headers: { 'Cache-Control': 'private, no-store' } }
  );
}
