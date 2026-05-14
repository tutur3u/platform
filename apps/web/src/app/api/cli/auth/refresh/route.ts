import {
  createCliAppSession,
  createCliSessionResponseBody,
  verifyCliRefreshToken,
} from '@tuturuuu/auth/cli-session';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const refreshSchema = z.object({
  refreshToken: z.string().trim().min(1),
});

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = refreshSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    );
  }

  const verification = verifyCliRefreshToken(parsed.data.refreshToken);

  if (!verification.ok) {
    return NextResponse.json(
      { error: 'Invalid or expired refresh token' },
      { status: 401 }
    );
  }

  const sbAdmin = await createAdminClient({ noCookie: true });
  const { data, error } = await sbAdmin.auth.admin.getUserById(
    verification.claims.sub
  );

  if (error || !data.user) {
    return NextResponse.json(
      { error: 'Invalid or expired refresh token' },
      { status: 401 }
    );
  }

  const session = createCliAppSession({
    email: data.user.email ?? verification.claims.email,
    userId: verification.claims.sub,
  });

  return NextResponse.json(createCliSessionResponseBody(session));
}
