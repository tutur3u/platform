import {
  type Identity,
  RoomError,
  requireRule,
  staff,
  text,
} from '@tuturuuu/multiplayer';
import {
  authenticate,
  authRoute,
  hash,
  randomToken,
  sessionCookie,
  sign,
} from './auth';
import type { Env } from './env';

export { ColabRoom } from './room';

async function bodyOf(request: Request): Promise<Record<string, unknown>> {
  requireRule(
    request.headers.get('content-type')?.includes('application/json'),
    'invalid_input',
    415
  );
  const reader = request.body?.getReader();
  requireRule(reader, 'invalid_input');
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 32000) {
      await reader.cancel();
      throw new RoomError('payload_too_large', 413);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new RoomError('invalid_input');
  }
  requireRule(
    body && typeof body === 'object' && !Array.isArray(body),
    'invalid_input'
  );
  return body as Record<string, unknown>;
}
async function handle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname.startsWith('/auth/') || url.pathname === '/verify-token')
    return authRoute(request, env);
  if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
  if (url.pathname === '/api/health')
    return Response.json({ app: 'colab', status: 'ok', sandbox: true });
  if (request.method !== 'GET') {
    requireRule(
      request.headers.get('origin') === env.APP_ORIGIN ||
        (url.hostname === '127.0.0.1' &&
          request.headers.get('origin') === url.origin),
      'invalid_origin',
      403
    );
    requireRule(request.method === 'POST', 'method_not_allowed', 405);
  }
  const identity = await authenticate(request, env);
  if (url.pathname === '/api/session')
    return Response.json({
      identity,
      canHost: identity ? staff(identity) : false,
    });
  if (url.pathname === '/api/logout' && request.method === 'POST')
    return Response.json(
      { ok: true },
      { headers: { 'Set-Cookie': sessionCookie('', 0) } }
    );
  if (url.pathname === '/api/rooms' && request.method === 'POST') {
    requireRule(identity && staff(identity), 'staff_only', 403);
    await env.ROOMS.getByName(`host:${identity.id}`).limit(
      'create',
      10,
      86400_000
    );
    const id = crypto.randomUUID();
    return Response.json(
      await env.ROOMS.getByName(id).create(id, identity, await bodyOf(request)),
      { status: 201 }
    );
  }
  const match =
    /^\/api\/rooms\/([a-f0-9-]{36})(?:\/(join|action|password|ai|live))?$/.exec(
      url.pathname
    );
  requireRule(match, 'not_found', 404);
  const room = env.ROOMS.getByName(match[1]);
  const action = match[2];
  if (action === 'join' && request.method === 'POST') {
    const body = await bodyOf(request);
    const guest: Identity = identity ?? {
      id: `guest:${randomToken()}`,
      name: text(body.name, 60),
      email: null,
      expires: Date.now() + 8 * 3600_000,
    };
    const attemptKey = await hash(
      request.headers.get('cf-connecting-ip') ?? 'local'
    );
    const result = await room.join(guest, body, attemptKey);
    if (!identity) {
      guest.guestVersion = result.guestVersion;
      guest.expires = Math.min(guest.expires, result.view.endsAt);
      const headers = {
        'Set-Cookie': sessionCookie(
          await sign(guest, env.COLAB_SESSION_SECRET),
          Math.floor((guest.expires - Date.now()) / 1000)
        ),
      };
      return Response.json(result.view, { headers });
    }
    return Response.json(result.view);
  }
  requireRule(identity, 'sign_in_required', 401);
  if (!action && request.method === 'GET')
    return Response.json(await room.view(identity));
  if (action === 'live' && request.method === 'GET') {
    requireRule(
      request.headers.get('origin') === env.APP_ORIGIN ||
        (url.hostname === '127.0.0.1' &&
          request.headers.get('origin') === url.origin),
      'invalid_origin',
      403
    );
    requireRule(
      request.headers.get('upgrade')?.toLowerCase() === 'websocket',
      'invalid_input'
    );
    return room.fetch(
      new Request('https://room/live', {
        headers: {
          Upgrade: 'websocket',
          'x-colab-identity': JSON.stringify(identity),
        },
      })
    );
  }
  requireRule(request.method === 'POST', 'method_not_allowed', 405);
  const body = await bodyOf(request);
  if (action === 'action')
    return Response.json(await room.action(identity, body));
  if (action === 'password')
    return Response.json(await room.password(identity, Number(body.minutes)));
  if (action === 'ai') return Response.json(await room.ai(identity, body));
  throw new RoomError('not_found', 404);
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    let response: Response;
    try {
      response = await handle(request, env);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'request_failed';
      const code = /^[a-z_]+$/.test(message) ? message : 'request_failed';
      const status =
        error instanceof RoomError
          ? error.status
          : ((
              {
                not_invited: 403,
                private_room: 403,
                room_missing: 404,
                rate_limited: 429,
                ai_busy: 409,
                edit_conflict: 409,
                room_full: 409,
                room_changed: 409,
              } as Record<string, number>
            )[code] ?? 400);
      const path = new URL(request.url).pathname;
      response =
        path.startsWith('/auth/') || path === '/verify-token'
          ? new Response(null, {
              status: 303,
              headers: {
                Location: '/?auth=retry',
                'Cache-Control': 'no-store',
              },
            })
          : Response.json({ error: code }, { status });
    }
    if (response.status === 101) return response;
    const headers = new Headers(response.headers);
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Referrer-Policy', 'no-referrer');
    headers.set(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
    );
    if (
      new URL(request.url).pathname.startsWith('/api/') ||
      new URL(request.url).pathname.startsWith('/auth/')
    )
      headers.set('Cache-Control', 'no-store');
    return new Response(response.body, { status: response.status, headers });
  },
} satisfies ExportedHandler<Env>;
