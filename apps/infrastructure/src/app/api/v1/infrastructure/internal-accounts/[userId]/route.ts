import {
  MAX_DISPLAY_NAME_LENGTH,
  MAX_EMAIL_LENGTH,
} from '@tuturuuu/utils/constants';
import { WORKSPACE_HANDLE_REGEX } from '@tuturuuu/utils/workspace-handle';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeInternalAccountRequest } from '@/lib/internal-accounts/authorization';
import {
  InternalAccountAdminError,
  mutateInternalAccount,
} from '@/lib/internal-accounts/service';

const ParamsSchema = z.object({
  userId: z.guid(),
});

const UpdateInternalAccountSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.enum(['disable_access', 'enable_access']),
    confirmationEmail: z.string().trim().email().max(MAX_EMAIL_LENGTH),
  }),
  z.object({
    action: z.literal('reset_password'),
    confirmationEmail: z.string().trim().email().max(MAX_EMAIL_LENGTH),
    newPassword: z.string().min(12).max(72),
  }),
  z.object({
    action: z.literal('update_profile'),
    displayName: z.string().trim().min(1).max(MAX_DISPLAY_NAME_LENGTH),
    username: z
      .string()
      .trim()
      .toLowerCase()
      .max(64)
      .regex(WORKSPACE_HANDLE_REGEX)
      .nullable(),
  }),
]);

interface RouteParams {
  params: Promise<{ userId: string }>;
}

const actionMessages = {
  disable_access: 'Internal account access disabled',
  enable_access: 'Internal account access restored',
  reset_password: 'Internal account password updated',
  update_profile: 'Internal account profile updated',
} as const;

export async function PATCH(request: Request, { params }: RouteParams) {
  const authorization = await authorizeInternalAccountRequest(request);
  if (!authorization.ok) return authorization.response;

  const parsedParams = ParamsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json(
      { message: 'Invalid internal account identifier' },
      { status: 400 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { message: 'Malformed request body' },
      { status: 400 }
    );
  }

  const parsed = UpdateInternalAccountSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid internal account action' },
      { status: 400 }
    );
  }

  try {
    const account = await mutateInternalAccount({
      ...parsed.data,
      actorUserId: authorization.user.id,
      sbAdmin: authorization.sbAdmin,
      targetUserId: parsedParams.data.userId,
    });

    return NextResponse.json({
      account,
      message: actionMessages[parsed.data.action],
    });
  } catch (error) {
    if (error instanceof InternalAccountAdminError) {
      return NextResponse.json(
        { message: error.message },
        { status: error.status }
      );
    }

    console.error('Unexpected internal account mutation failure');
    return NextResponse.json(
      { message: 'Unable to update the internal account' },
      { status: 500 }
    );
  }
}
