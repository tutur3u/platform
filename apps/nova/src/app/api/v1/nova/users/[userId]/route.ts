import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeNovaRoleManager } from '@/lib/nova-team-api-auth';

const userIdSchema = z.string().uuid().toLowerCase();

const roleUpdateSchema = z
  .object({
    allow_challenge_management: z.boolean(),
    allow_manage_all_challenges: z.boolean(),
    allow_role_management: z.boolean(),
    enabled: z.boolean(),
  })
  .strict();

type RouteContext = {
  params: Promise<{ userId?: string }>;
};

function invalidRequest() {
  return NextResponse.json({ message: 'Invalid request' }, { status: 400 });
}

export async function PUT(request: NextRequest, { params }: RouteContext) {
  const authorization = await authorizeNovaRoleManager(request);
  if (!authorization.ok) return authorization.response;

  const parsedUserId = userIdSchema.safeParse((await params).userId);
  if (!parsedUserId.success) return invalidRequest();
  const actorId = authorization.value.user.id;
  if (actorId === parsedUserId.data) {
    return NextResponse.json(
      { message: 'Cannot change your own platform roles' },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidRequest();
  }

  const parsedBody = roleUpdateSchema.safeParse(body);
  if (!parsedBody.success) return invalidRequest();

  const admin = await createAdminClient({
    noCookie: true,
    auditActorId: actorId,
  });
  const { error } = await admin
    .from('platform_user_roles')
    .update(parsedBody.data)
    .eq('user_id', parsedUserId.data);

  if (error?.code === 'PT409') {
    return NextResponse.json(
      { message: 'Cannot remove the last enabled platform role manager' },
      { status: 409 }
    );
  }
  if (error?.code === '42501') {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }
  if (error) {
    console.error('Failed to update Nova user permissions', error);
    return NextResponse.json(
      { message: 'Error updating user permissions' },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true }, { status: 200 });
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const authorization = await authorizeNovaRoleManager(request);
  if (!authorization.ok) return authorization.response;

  const parsedUserId = userIdSchema.safeParse((await params).userId);
  if (!parsedUserId.success) return invalidRequest();
  const actorId = authorization.value.user.id;
  if (actorId === parsedUserId.data) {
    return NextResponse.json(
      { message: 'Cannot change your own platform roles' },
      { status: 403 }
    );
  }

  const admin = await createAdminClient({
    noCookie: true,
    auditActorId: actorId,
  });
  const { error } = await admin
    .from('platform_user_roles')
    .delete()
    .eq('user_id', parsedUserId.data);

  if (error?.code === 'PT409') {
    return NextResponse.json(
      { message: 'Cannot remove the last enabled platform role manager' },
      { status: 409 }
    );
  }
  if (error?.code === '42501') {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }
  if (error) {
    console.error('Failed to delete Nova user permissions', error);
    return NextResponse.json(
      { message: 'Error deleting user permissions' },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true }, { status: 200 });
}
