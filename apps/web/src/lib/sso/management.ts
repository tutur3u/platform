import 'server-only';
import { endpointSchema, SsoError } from '@tuturuuu/sso';
import { createClient } from '@tuturuuu/supabase/next/server';
import { resolveWorkspaceId } from '@tuturuuu/utils/constants';
import { connection } from 'next/server';
import { z } from 'zod';
import { enabled } from './config';
import { managementPrincipal } from './identity';
import {
  activationInput,
  assignmentInput,
  clientCreate,
  clientUpdate,
  detailSchema,
  overviewSchema,
} from './management-schema';
import { adminClient } from './store';

class ManagementError extends Error {
  constructor(
    readonly status: number,
    readonly code: string
  ) {
    super(code);
  }
}
const fail = (status: number, code: string): never => {
  throw new ManagementError(status, code);
};
const json = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
  });
function rpcError(error: { code: string } | null) {
  if (!error) return;
  if (error.code === '42501') fail(403, 'sso_forbidden');
  if (['40001', '23505'].includes(error.code))
    fail(409, 'sso_revision_conflict');
  if (['22023', '23514'].includes(error.code)) fail(400, 'sso_invalid_input');
  fail(503, 'sso_unavailable');
}
export async function managementAccess(request: Request, workspaceId: string) {
  const path = z.uuid().safeParse(resolveWorkspaceId(workspaceId));
  if (!path.success) return fail(400, 'sso_invalid_input');
  const wsId = path.data;
  const client = await createClient(request);
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user) return fail(401, 'sso_unauthenticated');
  const member = await client
    .from('workspace_members')
    .select('type')
    .eq('ws_id', wsId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (member.error) return fail(503, 'sso_unavailable');
  if (member.data?.type !== 'MEMBER') return fail(403, 'sso_forbidden');
  const permission = await client.rpc('has_workspace_permission', {
    p_ws_id: wsId,
    p_user_id: user.id,
    p_permission: 'manage_sso_clients',
  });
  if (permission.error) return fail(503, 'sso_unavailable');
  if (permission.data !== true) return fail(403, 'sso_forbidden');
  return { wsId, userId: user.id };
}
export async function manageSso(
  request: Request,
  params: { wsId: string; clientId?: string },
  action: 'list' | 'detail' | 'create' | 'update' | 'assignment' | 'activation'
) {
  try {
    await connection();
    const { wsId, userId } = await managementAccess(request, params.wsId);
    const path = z.uuid().optional().safeParse(params.clientId);
    if (!path.success) return fail(400, 'sso_invalid_input');
    const clientId = path.data;
    const admin = await adminClient();
    const args = { p_ws_id: wsId, p_actor_id: userId };
    if (action === 'list') {
      const result = await admin.rpc('sso_management_overview', args);
      rpcError(result.error);
      return json({
        ...overviewSchema.parse(result.data),
        globalEnabled: enabled(),
      });
    }
    if (action === 'detail' && clientId) {
      const result = await admin.rpc('sso_management_detail', {
        ...args,
        p_client_id: clientId,
      });
      rpcError(result.error);
      const origin = endpointSchema.safeParse(process.env.SSO_SAML_ORIGIN);
      const canonical =
        origin.success && `${new URL(origin.data).origin}/` === origin.data
          ? origin.data
          : null;
      const base = canonical ? `${canonical}api/v1/sso/saml/${clientId}` : null;
      return json({
        ...detailSchema.parse(result.data),
        setup: base
          ? {
              metadataUrl: `${base}/metadata`,
              entityId: `${base}/metadata`,
              ssoUrl: `${base}/sso`,
            }
          : null,
        pilotSelected: clientId === process.env.SSO_SAML_CLIENT_ID,
      });
    }
    if (request.headers.get('origin') !== new URL(request.url).origin)
      return fail(403, 'sso_forbidden');
    if (
      request.headers.get('content-type')?.split(';')[0] !== 'application/json'
    )
      return fail(400, 'sso_invalid_input');
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return fail(400, 'sso_invalid_input');
    }
    // Verify after receiving the body so a slow upload cannot age the proof.
    const actor = await managementPrincipal(request, admin);
    if (actor.userId !== userId) return fail(403, 'sso_forbidden');
    const age = Math.floor(Date.now() / 1000) - actor.mfaAt;
    if (age < 0 || age > 600) return fail(403, 'sso_mfa_required');
    if (action === 'assignment' && clientId) {
      const input = assignmentInput.safeParse(body);
      if (!input.success) return fail(400, 'sso_invalid_input');
      const result = await admin.rpc('sso_set_assignment', {
        ...args,
        p_client_id: clientId,
        p_user_id: input.data.userId,
        p_expected_revision: input.data.expectedRevision,
        p_active: input.data.active,
      });
      rpcError(result.error);
      if (!result.data) return fail(503, 'sso_unavailable');
      return json({ ok: true });
    }
    if (action === 'activation' && clientId) {
      const input = activationInput.safeParse(body);
      if (!input.success) return fail(400, 'sso_invalid_input');
      if (input.data.enabled && input.data.confirmEnable !== true)
        return fail(400, 'sso_confirm_enable');
      const result = await admin.rpc('sso_set_client_enabled', {
        ...args,
        p_client_id: clientId,
        p_expected_revision: input.data.expectedRevision,
        p_enabled: input.data.enabled,
      });
      rpcError(result.error);
      return json(
        z
          .object({ id: z.uuid(), revision: z.number().int().positive() })
          .parse(result.data)
      );
    }
    const parsed = (
      action === 'create' ? clientCreate : clientUpdate
    ).safeParse(body);
    if (!parsed.success) return fail(400, 'sso_invalid_input');
    const input = parsed.data;
    if (input.enabled && input.confirmEnable !== true)
      return fail(400, 'sso_confirm_enable');
    const result = await admin.rpc('sso_save_saml_client', {
      ...args,
      // Generated Supabase args do not admit null for nullable PostgreSQL arguments.
      ...(clientId ? { p_client_id: clientId } : {}),
      p_expected_revision: input.expectedRevision,
      p_display_name: input.displayName,
      p_approved_email_domains: input.domains,
      p_entity_id: input.entityId,
      p_acs_url: input.acsUrl,
      p_request_signing_mode: input.requestSigning.mode,
      p_sp_certificate:
        input.requestSigning.mode === 'required'
          ? input.requestSigning.certificate
          : undefined,
      p_enabled: input.enabled,
    });
    rpcError(result.error);
    return json(
      z
        .object({ id: z.uuid(), revision: z.number().int().positive() })
        .parse(result.data),
      action === 'create' ? 201 : 200
    );
  } catch (error) {
    if (error instanceof ManagementError)
      return json({ error: error.code }, error.status);
    if (
      error instanceof SsoError &&
      ['mfa_required', 'forbidden'].includes(error.code)
    )
      return json({ error: `sso_${error.code}` }, 403);
    return json({ error: 'sso_unavailable' }, 503);
  }
}
