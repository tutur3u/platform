import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeNovaRoleManager } from '@/lib/nova-team-api-auth';

const userIdSchema = z.string().uuid();

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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidRequest();
  }

  const parsedBody = roleUpdateSchema.safeParse(body);
  if (!parsedBody.success) return invalidRequest();

  const { error } = await authorization.value.sbAdmin
    .from('platform_user_roles')
    .update(parsedBody.data)
    .eq('user_id', parsedUserId.data);

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

  const { error } = await authorization.value.sbAdmin
    .from('platform_user_roles')
    .delete()
    .eq('user_id', parsedUserId.data);

  if (error) {
    console.error('Failed to delete Nova user permissions', error);
    return NextResponse.json(
      { message: 'Error deleting user permissions' },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true }, { status: 200 });
}
