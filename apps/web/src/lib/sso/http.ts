import { randomUUID } from 'node:crypto';
import type { IssuancePrincipal } from '@tuturuuu/sso';
import {
  createIdpMetadata,
  decideLogin,
  parseAuthnRequest,
  SsoError,
} from '@tuturuuu/sso';
import { createNodeSigner } from '@tuturuuu/sso/node-signer';
import { extractIPFromRequest } from '@tuturuuu/utils/abuse-protection/edge';
import { type NextRequest, NextResponse } from 'next/server';
import { checkRateLimitRedis } from '@/lib/rate-limit';
import {
  cookieName,
  csrfFor,
  handleSchema,
  opaque,
  seal,
  unseal,
} from './browser-state';
import { configuration, enabled, hash, privateHeaders } from './config';
import { bindSession, browserSession, principal } from './identity';
import { postResponse } from './post-response';
import { adminClient, requireRpc, snapshot } from './store';

export async function rateLimit(key: string, maxRequests: number) {
  const result = await checkRateLimitRedis(
    `sso:${hash(key)}`,
    { windowMs: 60_000, maxRequests },
    { failClosed: true }
  );
  if (!result.allowed) throw new SsoError({ code: 'unavailable' });
}
export async function guard(operation: () => Promise<Response>) {
  try {
    return await operation();
  } catch (error) {
    const code = error instanceof SsoError ? error.code : 'unavailable';
    const status =
      code === 'disabled' ? 404 : code === 'unavailable' ? 503 : 403;
    return NextResponse.json(
      { error: `sso_${code}` },
      { status, headers: privateHeaders }
    );
  }
}
export async function metadata(request: NextRequest, clientId: string) {
  return guard(async () => {
    const config = configuration();
    if (clientId !== config.clientId) throw new SsoError({ code: 'forbidden' });
    await rateLimit(
      `metadata:${clientId}:${extractIPFromRequest(request.headers)}`,
      20
    );
    const current = await snapshot(await adminClient(), config);
    createNodeSigner({
      privateKey: config.privateKey,
      certificate: current.idp.signingCertificate,
    });
    return new Response(
      createIdpMetadata(current.idp, () => new Date()),
      {
        headers: {
          ...privateHeaders,
          'Content-Type': 'application/samlmetadata+xml',
        },
      }
    );
  });
}
async function boundedBody(request: Request, limit: number) {
  if (!request.body) throw new SsoError({ code: 'forbidden' });
  const reader = request.body.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > limit) throw new SsoError({ code: 'forbidden' });
      chunks.push(chunk.value);
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(
    Buffer.concat(chunks)
  );
}
export async function start(request: NextRequest, clientId: string) {
  return guard(async () => {
    const config = configuration();
    if (clientId !== config.clientId) throw new SsoError({ code: 'forbidden' });
    await rateLimit(`start:${clientId}`, 100);
    await rateLimit(
      `start:${clientId}:${extractIPFromRequest(request.headers)}`,
      20
    );
    const admin = await adminClient();
    const current = await snapshot(admin, config);
    createNodeSigner({
      privateKey: config.privateKey,
      certificate: current.idp.signingCertificate,
    });
    if (
      request.method === 'POST' &&
      request.headers.get('content-type')?.split(';')[0] !==
        'application/x-www-form-urlencoded'
    ) {
      throw new SsoError({ code: 'forbidden' });
    }
    const parsed = parseAuthnRequest(
      request.method === 'POST'
        ? { binding: 'post', body: await boundedBody(request, 65_536) }
        : { binding: 'redirect', rawQuery: request.nextUrl.search.slice(1) },
      { idp: current.idp, profiles: [current.profile], now: () => new Date() }
    );
    const handle = opaque();
    const browserHash = hash(opaque());
    // Leave a margin below the database's five-minute maximum after network transit.
    const expiresAt = new Date(Date.now() + 290_000).toISOString();
    const starter = await browserSession(request);
    const result = await admin.rpc('sso_create_transaction', {
      p_ws_id: current.policy.workspaceId,
      p_client_id: clientId,
      p_policy_revision: current.policy.revision,
      p_request_id: parsed.id,
      p_handle_hash: hash(handle),
      p_browser_binding_hash: browserHash,
      p_relay_state_hash: hash(parsed.relayState ?? ''),
      p_acs_url: parsed.acsUrl,
      p_allow_create: parsed.allowCreate,
      p_expires_at: expiresAt,
      ...(starter
        ? {
            p_starter_binding_hash: hash(
              `${starter.userId}:${starter.sessionId}`
            ),
          }
        : {}),
    });
    requireRpc(result);
    if (!result.data) throw new SsoError({ code: 'unavailable' });
    const state = {
      id: result.data.id,
      handle,
      browserHash,
      csrf: opaque(),
      expiresAt,
      request: parsed,
      policy: current.policy,
    };
    const response = NextResponse.redirect(
      `${config.origin}en/sso/consent?transaction=${handle}`,
      303
    );
    for (const [name, value] of Object.entries(privateHeaders))
      response.headers.set(name, value);
    response.cookies.set(cookieName(handle), await seal(state, config), {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 290,
    });
    return response;
  });
}
export async function decision(request: NextRequest, handle: string) {
  return guard(async () => {
    const config = configuration();
    handleSchema.parse(handle);
    if (
      request.headers.get('origin') !== new URL(config.origin).origin ||
      request.headers.get('content-type')?.split(';')[0] !==
        'application/x-www-form-urlencoded'
    ) {
      throw new SsoError({ code: 'forbidden' });
    }
    await rateLimit(`decision:${config.clientId}`, 100);
    const state = await unseal(
      request.cookies.get(cookieName(handle))?.value,
      handle,
      config
    );
    const form = new URLSearchParams(await boundedBody(request, 512));
    if (
      [...form.keys()].length !== 3 ||
      form.getAll('decision').length !== 1 ||
      form.getAll('csrf').length !== 1 ||
      form.getAll('locale').length !== 1 ||
      !['approve', 'deny'].includes(form.get('decision') ?? '') ||
      !['en', 'vi'].includes(form.get('locale') ?? '')
    )
      throw new SsoError({ code: 'forbidden' });
    const admin = await adminClient();
    let actor: IssuancePrincipal | undefined;
    let consumingActor: IssuancePrincipal | undefined;
    let accountRateChecked = false;
    let sessionRejected = false;
    const txArgs = {
      p_ws_id: state.policy.workspaceId,
      p_client_id: config.clientId,
      p_transaction_id: state.id,
      p_policy_revision: state.policy.revision,
    };
    const boundArgs = (p: IssuancePrincipal) => ({
      ...txArgs,
      p_actor_id: p.userId,
      p_browser_binding_hash: state.browserHash,
      p_session_binding_hash: hash(`${p.userId}:${p.sessionId}`),
    });
    const result = await decideLogin(
      state,
      form.get('decision') === 'approve',
      {
        enabled,
        now: () => new Date(),
        generateId: () => `_${randomUUID()}`,
        current: async () => {
          actor = await principal(request, admin);
          if (!accountRateChecked) {
            try {
              await bindSession(admin, state, actor);
            } catch (error) {
              sessionRejected =
                error instanceof SsoError && error.code === 'session_changed';
              throw error;
            }
            await rateLimit(`decision:${config.clientId}:${actor.userId}`, 10);
            accountRateChecked = true;
          }
          if (form.get('csrf') !== csrfFor(state, actor))
            throw new SsoError({ code: 'forbidden' });
          return {
            ...(await snapshot(admin, config, actor.userId)),
            principal: actor,
          };
        },
        prepareSigner: async () => {
          const current = await snapshot(admin, config);
          return createNodeSigner({
            privateKey: config.privateKey,
            certificate: current.idp.signingCertificate,
          });
        },
        consent: async (approved, p) =>
          requireRpc(
            await admin.rpc('sso_record_consent', {
              ...boundArgs(p),
              p_approved: approved,
            })
          ),
        consume: async (p) => {
          consumingActor = p;
          const r = await admin.rpc('sso_consume_transaction', boundArgs(p));
          requireRpc(r);
          if (!r.data) throw new SsoError({ code: 'unavailable' });
          return r.data.subject;
        },
        finalize: async (p) =>
          requireRpc(
            await admin.rpc('sso_finalize_issuance', {
              ...txArgs,
              p_actor_id: p.userId,
              p_key_id: state.policy.keyId,
              p_key_revision: state.policy.keyRevision,
            })
          ),
        failed: async (consumed) => {
          if (sessionRejected) return;
          if (consumed && consumingActor) {
            requireRpc(
              await admin.rpc('sso_append_audit', {
                ...txArgs,
                p_actor_id: consumingActor.userId,
                p_event_type: 'issuance.failed',
              })
            );
          } else {
            requireRpc(
              await admin.rpc('sso_reject_transaction', {
                ...txArgs,
                p_browser_binding_hash: state.browserHash,
                ...(actor ? { p_actor_id: actor.userId } : {}),
              })
            );
          }
        },
      }
    );
    const locale = form.get('locale') === 'vi' ? 'vi' : 'en';
    const response =
      result.kind === 'issued'
        ? postResponse(result.response, locale)
        : NextResponse.redirect(
            `${config.origin}${locale}/sso/consent?denied=1`,
            303
          );
    response.headers.set(
      'Set-Cookie',
      `${cookieName(handle)}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`
    );
    return response;
  });
}
