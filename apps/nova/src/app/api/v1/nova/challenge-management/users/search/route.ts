import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { connection, NextResponse } from 'next/server';
import { z } from 'zod';
import { getNovaAppSessionUserFromRequest } from '@/lib/app-session';
import { canManageNovaChallengesGlobally } from '@/lib/challenge-management-auth';

const MAX_RESULTS = 20;

const searchSchema = z.object({
  q: z.string().trim().max(100).default(''),
  selectedUserId: z.guid().optional(),
});

interface UserSearchRow {
  display_name: string | null;
  id: string;
  user_private_details:
    | { email: string | null }
    | { email: string | null }[]
    | null;
}

export interface NovaSubmissionUserProjection {
  display_name: string | null;
  email: string | null;
  id: string;
}

export function escapePostgrestLikePattern(value: string) {
  return value.replace(/[\\%_]/gu, '\\$&');
}

export function isWildcardOnlySearch(value: string) {
  return value.replace(/[\\%_]/gu, '').trim().length === 0;
}

function projectUser(row: UserSearchRow): NovaSubmissionUserProjection {
  const details = Array.isArray(row.user_private_details)
    ? row.user_private_details[0]
    : row.user_private_details;

  return {
    display_name: row.display_name,
    email: details?.email ?? null,
    id: row.id,
  };
}

export async function GET(request: Request) {
  await connection();

  const user = getNovaAppSessionUserFromRequest(request);
  if (!user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  if (!(await canManageNovaChallengesGlobally(user))) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const parsed = searchSchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams)
  );
  if (!parsed.success) {
    return NextResponse.json({ message: 'Invalid search' }, { status: 400 });
  }

  const { q, selectedUserId } = parsed.data;
  if ((q.length > 0 && q.length < 2) || (q && isWildcardOnlySearch(q))) {
    return NextResponse.json({ message: 'Invalid search' }, { status: 400 });
  }

  if (!q && !selectedUserId) {
    return NextResponse.json({ data: [], selected: null });
  }

  const sbAdmin = await createAdminClient({ noCookie: true });

  try {
    const searchPromise = q
      ? sbAdmin
          .from('users')
          .select('id, display_name, user_private_details!inner(email)')
          .ilike(
            'user_private_details.email',
            `%${escapePostgrestLikePattern(q)}%`
          )
          .order('email', {
            ascending: true,
            referencedTable: 'user_private_details',
          })
          .order('id', { ascending: true })
          .limit(MAX_RESULTS)
      : Promise.resolve({ data: [], error: null });

    const selectedPromise = selectedUserId
      ? sbAdmin
          .from('users')
          .select('id, display_name, user_private_details!inner(email)')
          .eq('id', selectedUserId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null });

    const [searchResult, selectedResult] = await Promise.all([
      searchPromise,
      selectedPromise,
    ]);

    if (searchResult.error || selectedResult.error) {
      throw searchResult.error ?? selectedResult.error;
    }

    return NextResponse.json({
      data: ((searchResult.data ?? []) as UserSearchRow[])
        .slice(0, MAX_RESULTS)
        .map(projectUser),
      selected: selectedResult.data
        ? projectUser(selectedResult.data as UserSearchRow)
        : null,
    });
  } catch (error) {
    console.error('Failed to search Nova submission users', { error });
    return NextResponse.json(
      { message: 'Failed to search users' },
      { status: 500 }
    );
  }
}
