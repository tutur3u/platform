import { getAppSessionClaimsFromRequest } from '@tuturuuu/auth/app-session';
import {
  updateCurrentUserProfile,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const profileSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
  email: z.string().email().optional(),
});

export async function PATCH(request: NextRequest) {
  const parsed = profileSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid profile payload' },
      { status: 400 }
    );
  }

  const appSession = getAppSessionClaimsFromRequest(request, {
    targetApp: 'learn',
  });

  if (!appSession) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  if (parsed.data.email && parsed.data.email !== appSession.email) {
    return NextResponse.json(
      {
        message: 'Email changes are handled by central Tuturuuu account auth.',
      },
      { status: 410 }
    );
  }

  await updateCurrentUserProfile(
    { display_name: parsed.data.displayName },
    withForwardedInternalApiAuth(request.headers)
  );

  return NextResponse.json({ success: true });
}
