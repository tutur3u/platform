import { createClient } from '@tuturuuu/supabase/next/server';
import { checkWorkspaceCreationLimit } from '@tuturuuu/utils/workspace-limits';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const supabase = await createClient(request);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user)
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const limitCheck = await checkWorkspaceCreationLimit(
    supabase,
    user.id,
    user.email
  );

  if (limitCheck.errorCode === 'WORKSPACE_COUNT_ERROR') {
    return NextResponse.json(
      { message: limitCheck.errorMessage },
      { status: 500 }
    );
  }

  return NextResponse.json({
    canCreate: limitCheck.canCreate,
    currentCount: limitCheck.currentCount ?? 0,
    limit: limitCheck.limit ?? 0,
    remaining: limitCheck.limit
      ? Math.max(0, limitCheck.limit - (limitCheck.currentCount ?? 0))
      : null,
  });
}
