import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  type ContactOperationStore,
  createContactOperation,
  reconcileContactOperation,
} from '@tuturuuu/utils/contact-create-operation';
import { MAX_NAME_LENGTH } from '@tuturuuu/utils/constants';
import {
  getPermissions,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { connection, NextResponse } from 'next/server';
import { z } from 'zod';
import { type AuthorizedRequest, withSessionAuth } from '@/lib/api-auth';
import { normalizeWorkspaceId } from '@/lib/workspace-helper';

const headers = { 'Cache-Control': 'private, no-store' };
const operationIdSchema = z.uuid().transform((value) => value.toLowerCase());
const inputSchema = z
  .object({
    operationId: operationIdSchema,
    email: z
      .email()
      .max(100)
      .transform((value) => value.toLowerCase()),
    displayName: z.string().trim().max(MAX_NAME_LENGTH).nullable(),
  })
  .strict();
const options = {
  allowAppSessionAuth: { targetApp: ['mail'] },
  maxPayloadSize: 4096,
  rateLimit: { windowMs: 60_000, maxRequests: 20 },
} satisfies NonNullable<Parameters<typeof withSessionAuth>[1]>;

async function authorize(
  request: Request,
  context: AuthorizedRequest,
  rawWsId: string
) {
  const wsId = await normalizeWorkspaceId(rawWsId, context.supabase, request);
  const membership = await verifyWorkspaceMembershipType({
    wsId,
    userId: context.user.id,
    supabase: context.supabase,
    requiredType: 'MEMBER',
  });
  if (!membership.ok)
    return {
      response: NextResponse.json(
        { error: 'Not found' },
        { status: 404, headers }
      ),
    };
  const permissions = await getPermissions({
    wsId,
    user: context.user,
    request,
  });
  if (!permissions?.containsPermission('create_users')) {
    return {
      response: NextResponse.json(
        { error: 'Forbidden' },
        { status: 403, headers }
      ),
    };
  }
  return { wsId };
}

async function operationStore(): Promise<ContactOperationStore> {
  const admin = await createAdminClient({ noCookie: true });
  return {
    async find({ workspaceId, contactId }) {
      const { data, error } = await admin
        .from('workspace_users')
        .select('id, email, display_name')
        .eq('ws_id', workspaceId)
        .eq('id', contactId)
        .maybeSingle();
      if (error) throw new Error('Contact operation read unconfirmed');
      return data
        ? { id: data.id, email: data.email, displayName: data.display_name }
        : null;
    },
    async create({ workspaceId, contactId, actorId, email, displayName }) {
      const { data, error } = await admin.rpc(
        'admin_create_workspace_user_with_audit_actor',
        {
          p_ws_id: workspaceId,
          p_actor_auth_uid: actorId,
          p_payload: { id: contactId, email, display_name: displayName },
        }
      );
      if (error || data?.id !== contactId)
        throw new Error('Contact operation write unconfirmed');
    },
  };
}

export const GET = withSessionAuth<{ wsId: string }>(
  async (request, context, params) => {
    await connection();
    const access = await authorize(request, context, params.wsId);
    if (access.response) return access.response;
    const rawOperationId = request.nextUrl.searchParams.get('operationId');
    if (!rawOperationId)
      return NextResponse.json({ canCreate: true }, { headers });
    const operation = operationIdSchema.safeParse(rawOperationId);
    if (!operation.success)
      return NextResponse.json(
        { error: 'Invalid operation' },
        { status: 400, headers }
      );
    const result = await reconcileContactOperation(await operationStore(), {
      actorId: context.user.id,
      workspaceId: access.wsId,
      operationId: operation.data,
    });
    return NextResponse.json(result, { headers });
  },
  options
);

export const POST = withSessionAuth<{ wsId: string }>(
  async (request, context, params) => {
    await connection();
    const access = await authorize(request, context, params.wsId);
    if (access.response) return access.response;
    const parsed = inputSchema.safeParse(
      await request.json().catch(() => null)
    );
    if (!parsed.success)
      return NextResponse.json(
        { error: 'Invalid contact' },
        { status: 400, headers }
      );
    const result = await createContactOperation(
      await operationStore(),
      {
        actorId: context.user.id,
        workspaceId: access.wsId,
        operationId: parsed.data.operationId,
      },
      { ...parsed.data, displayName: parsed.data.displayName || null }
    );
    return NextResponse.json(result, {
      status:
        result.state === 'conflict'
          ? 409
          : result.state === 'unknown'
            ? 202
            : 200,
      headers,
    });
  },
  options
);
