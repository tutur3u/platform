import { createClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { getPostEmailMaxAgeCutoff } from '@/lib/post-email-queue';

interface Params {
  params: Promise<{ wsId: string }>;
}

export async function GET(request: Request, { params }: Params) {
  const supabase = await createClient(request);
  const { wsId } = await params;
  const url = new URL(request.url);
  const includedGroups = url.searchParams.getAll('includedGroups');

  const permissions = await getPermissions({ wsId, request });
  if (!permissions) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const userGroupsPromise = supabase.rpc(
    'get_workspace_post_review_filter_options',
    {
      p_cutoff: getPostEmailMaxAgeCutoff(),
      p_included_group_ids:
        includedGroups.length > 0 ? includedGroups : undefined,
      p_ws_id: wsId,
    }
  );

  const { data: filterOptions, error } = await userGroupsPromise;

  if (error) {
    console.error('Error loading post filter options:', {
      filterOptions: error,
    });
    return NextResponse.json(
      { message: 'Failed to load filter options' },
      { status: 500 }
    );
  }

  const options = filterOptions ?? [];
  const userGroups = options
    .filter((option) => option.option_scope === 'include_group')
    .map((option) => ({
      amount: Number(option.amount ?? 0),
      id: option.id,
      name: option.label,
    }));
  const excludedUserGroups = options
    .filter((option) => option.option_scope === 'exclude_group')
    .map((option) => ({
      amount: Number(option.amount ?? 0),
      id: option.id,
      name: option.label,
    }));
  const users = options
    .filter((option) => option.option_scope === 'user')
    .map((option) => ({
      full_name: option.label,
      id: option.id,
    }));

  return NextResponse.json({
    excludedUserGroups,
    userGroups,
    users,
  });
}
