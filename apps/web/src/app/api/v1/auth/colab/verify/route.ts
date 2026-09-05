import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

/** Consume a Colab-only one-time handoff and resolve email from auth.users.
 * cross_app_tokens.session_data is caller supplied and is never an authority
 * for the @tuturuuu.com host permission or account invitation matching.
 */
export async function POST(request: Request) {
  const headers = { 'Cache-Control': 'no-store' };
  const body = await request.json().catch(() => null);
  if (
    !body ||
    typeof body.token !== 'string' ||
    !/^[a-f0-9]{64}$/.test(body.token)
  ) {
    return NextResponse.json(
      { error: 'invalid_login' },
      { status: 400, headers }
    );
  }
  const admin = await createAdminClient();
  const { data, error } = await admin.rpc(
    'validate_cross_app_token_with_session',
    {
      p_token: body.token,
      p_target_app: 'colab',
    }
  );
  const row = (Array.isArray(data) ? data[0] : data) as {
    user_id?: string;
  } | null;
  if (error || !row?.user_id) {
    return NextResponse.json(
      { error: 'invalid_login' },
      { status: 401, headers }
    );
  }
  const { data: authData, error: authError } =
    await admin.auth.admin.getUserById(row.user_id);
  const user = authData.user;
  if (
    authError ||
    !user?.email ||
    !user.email_confirmed_at ||
    (user.banned_until && Date.parse(user.banned_until) > Date.now())
  ) {
    return NextResponse.json(
      { error: 'verified_account_required' },
      { status: 403, headers }
    );
  }
  return NextResponse.json(
    {
      valid: true,
      userId: user.id,
      email: user.email,
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    },
    { headers }
  );
}
