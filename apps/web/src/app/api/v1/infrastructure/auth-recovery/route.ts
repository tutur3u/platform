import { MAX_SEARCH_LENGTH } from '@tuturuuu/utils/constants';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  createAuthRecoveryOverride,
  listAuthRecoverySnapshot,
} from '@/lib/auth/recovery';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { authorizeAbuseIntelligenceRequest } from '../abuse-intelligence/_shared';

const CreateAuthRecoveryOverrideSchema = z.object({
  allowNormalLogin: z.boolean().default(true),
  allowRecoveryEmail: z.boolean().default(true),
  clearEmailScoped: z.boolean().default(true),
  clearRelatedIpBlocks: z.boolean().default(false),
  clearRelatedIpCounters: z.boolean().default(true),
  email: z.string().email(),
  expiresAt: z.string().datetime().optional(),
  reason: z.string().trim().min(1).max(MAX_SEARCH_LENGTH),
});

export async function GET(request: Request) {
  const authorization = await authorizeAbuseIntelligenceRequest(request);
  if (!authorization.ok) return authorization.response;

  const email = new URL(request.url).searchParams.get('email');

  try {
    return NextResponse.json(await listAuthRecoverySnapshot(email));
  } catch (error) {
    serverLogger.error('Failed to load auth recovery snapshot', error);
    return NextResponse.json(
      { message: 'Failed to load auth recovery snapshot' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const authorization = await authorizeAbuseIntelligenceRequest(
    request,
    'manage_workspace_roles'
  );
  if (!authorization.ok) return authorization.response;

  const parsed = CreateAuthRecoveryOverrideSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { errors: parsed.error.issues, message: 'Invalid request data' },
      { status: 400 }
    );
  }

  try {
    const override = await createAuthRecoveryOverride({
      actorUserId: authorization.user.id,
      request,
      ...parsed.data,
    });
    return NextResponse.json({ override }, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to create override';
    return NextResponse.json({ message }, { status: 400 });
  }
}
