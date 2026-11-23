import { getFinanceRouteContext } from '@tuturuuu/apis/finance/request-access';
import { resolveFinanceRouteAuthContext } from '@tuturuuu/finance-core/route-auth';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { PermissionsResult } from '@tuturuuu/utils/workspace-helper';
import { connection, NextResponse } from 'next/server';
import { z } from 'zod';
import type { ContactLinkDatabase } from '@/lib/contact-account-link';

const ContactLinkRequest = z.discriminatedUnion('action', [
  z.strictObject({
    action: z.literal('invite'),
    workspaceUserId: z.guid(),
    platformAccountId: z.guid(),
  }),
  z.strictObject({
    action: z.enum(['confirm', 'decline']),
    workspaceUserId: z.guid(),
    invitationId: z.guid(),
  }),
  z.strictObject({
    action: z.literal('unlink'),
    workspaceUserId: z.guid(),
    platformAccountId: z.guid(),
  }),
  z.strictObject({
    action: z.literal('revoke'),
    workspaceUserId: z.guid(),
  }),
]);

const LegacyRepairRequest = z.strictObject({
  workspaceUserId: z.guid().optional(),
});

const ConfirmationOutcome = z.enum([
  'confirmation_required',
  'ineligible',
  'linked',
  'declined',
  'revoked',
]);

const InvitationStatus = z
  .strictObject({
    state: z.enum([
      'pending',
      'expired',
      'accepted',
      'declined',
      'cancelled',
      'ineligible',
    ]),
    invitationId: z.guid().nullable(),
    accountId: z.guid().nullable(),
    updatedAt: z.string(),
    expiresAt: z.string().nullable(),
  })
  .nullable();

function result(outcome: string, status = 200) {
  return NextResponse.json(
    { outcome },
    { status, headers: { 'Cache-Control': 'private, no-store' } }
  );
}

function lacksInvitePermission(permissions: PermissionsResult) {
  return (
    permissions.withoutPermission('update_users') ||
    permissions.withoutPermission('view_users_private_info') ||
    permissions.withoutPermission('view_users_public_info')
  );
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  await connection();
  const { wsId } = await params;
  const contactId = z
    .guid()
    .safeParse(new URL(request.url).searchParams.get('workspaceUserId'));
  const authContext = await resolveFinanceRouteAuthContext(request, {
    targetApp: ['contacts', 'platform'],
  });
  const access = await getFinanceRouteContext(request, wsId, authContext);
  if (access.response) return access.response;
  if (!contactId.success) return result('invalid_request', 400);

  const { normalizedWsId, permissions, user } = access.context;
  if (lacksInvitePermission(permissions)) return result('forbidden', 403);

  const database = await createAdminClient<ContactLinkDatabase>({
    noCookie: true,
    auditActorId: user.id,
  });
  const { data, error } = await database
    .schema('private')
    .rpc('read_contact_account_link_invitation', {
      p_ws_id: normalizedWsId,
      p_contact_id: contactId.data,
      p_actor_id: user.id,
    });
  if (error?.code === '42501') return result('forbidden', 403);
  const invitation = InvitationStatus.safeParse(data ?? null);
  if (error || !invitation.success) return result('unavailable', 500);
  return NextResponse.json(
    { invitation: invitation.data },
    { headers: { 'Cache-Control': 'private, no-store' } }
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  await connection();
  const { wsId } = await params;
  const contentType = request.headers
    .get('content-type')
    ?.split(';')[0]
    ?.trim();
  if (contentType !== 'application/json') return result('invalid_request', 415);

  const body: unknown = await request.json().catch(() => null);
  const parsed = ContactLinkRequest.safeParse(body);
  const action = parsed.success ? parsed.data.action : null;
  const recipientAction = action === 'confirm' || action === 'decline';
  if (recipientAction || action === 'unlink') {
    const origin = request.headers.get('origin');
    const sameOrigin = origin
      ? origin === new URL(request.url).origin
      : request.headers.get('sec-fetch-site') === 'same-origin';
    if (!sameOrigin) return result('forbidden', 403);
  }

  const authContext = recipientAction
    ? undefined
    : await resolveFinanceRouteAuthContext(request, {
        targetApp: ['contacts', 'platform'],
      });
  const access = await getFinanceRouteContext(request, wsId, authContext);
  if (access.response) return access.response;

  if (!parsed.success) {
    if (!LegacyRepairRequest.safeParse(body).success) {
      return result('invalid_request', 400);
    }
    return result('confirmation_required', 409);
  }

  const { normalizedWsId, permissions, user } = access.context;
  const link = parsed.data;
  if (
    (link.action === 'invite' || link.action === 'revoke') &&
    lacksInvitePermission(permissions)
  ) {
    return result('forbidden', 403);
  }

  const database = await createAdminClient<ContactLinkDatabase>({
    noCookie: true,
    auditActorId: user.id,
  });
  const linkService = database.schema('private');
  const identity = {
    p_ws_id: normalizedWsId,
    p_contact_id: link.workspaceUserId,
    p_actor_id: user.id,
  };

  if (link.action === 'invite') {
    const { data, error } = await linkService.rpc(
      'invite_contact_account_link',
      {
        ...identity,
        p_account_id: link.platformAccountId,
      }
    );
    if (error?.code === '42501') return result('forbidden', 403);
    if (error) return result('unavailable', 500);
    if (!data) return result('ineligible', 409);
    return NextResponse.json(
      { outcome: 'invited', invitationId: data },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  }

  if (link.action === 'unlink') {
    const { data, error } = await linkService.rpc(
      'unlink_contact_account_link',
      {
        ...identity,
        p_account_id: link.platformAccountId,
      }
    );
    if (error?.code === '42501') return result('forbidden', 403);
    if (error) return result('unavailable', 500);
    return data === 'unlinked' ? result('unlinked') : result('ineligible', 409);
  }

  const invitation = {
    ...identity,
    p_invitation_id: link.action === 'revoke' ? null : link.invitationId,
  };
  const { data, error } =
    link.action === 'confirm'
      ? await linkService.rpc('confirm_contact_account_link', {
          ...identity,
          p_invitation_id: link.invitationId,
        })
      : await linkService.rpc('finish_contact_account_link_invitation', {
          ...invitation,
          p_action: link.action,
        });
  const outcome = ConfirmationOutcome.safeParse(data);
  if (error?.code === '42501') return result('forbidden', 403);
  if (error || !outcome.success) return result('unavailable', 500);
  return result(
    outcome.data,
    outcome.data === 'confirmation_required' || outcome.data === 'ineligible'
      ? 409
      : 200
  );
}
