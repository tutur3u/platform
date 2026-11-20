// Web API and Supabase Auth calls the qualification makes as real users.
import { check } from './env.mjs';

const REQUEST_TIMEOUT_MS = 30_000;

export async function signIn(config, identity) {
  const response = await fetch(
    `${config.supabaseUrl}/auth/v1/token?grant_type=password`,
    {
      body: JSON.stringify(identity),
      headers: {
        apikey: config.publishableKey,
        'Content-Type': 'application/json',
      },
      method: 'POST',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    }
  );
  check(response.ok, `sign-in returned ${response.status}`);
  const body = await response.json();
  check(typeof body.access_token === 'string', 'sign-in returned no session');
  return { token: body.access_token, userId: body.user?.id?.toLowerCase() };
}

export function createWebClient(config) {
  async function request(session, path, init = {}) {
    const headers = new Headers(init.headers);
    if (session) headers.set('Authorization', `Bearer ${session.token}`);
    if (init.body) headers.set('Content-Type', 'application/json');
    return fetch(new URL(path, config.webOrigin), {
      ...init,
      cache: 'no-store',
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  }

  async function json(session, path, init) {
    const response = await request(session, path, init);
    check(
      response.ok,
      `${init?.method ?? 'GET'} ${label(path)} returned ${response.status}`
    );
    return response.json();
  }

  const chat = (wsId) => `/api/v1/workspaces/${wsId}/chat`;

  return {
    request,
    ticket(session, wsId, conversationId) {
      const query = conversationId ? `?conversationId=${conversationId}` : '';
      return request(session, `${chat(wsId)}/realtime/ticket${query}`);
    },
    async ticketJson(session, wsId, conversationId) {
      const response = await this.ticket(session, wsId, conversationId);
      check(response.ok, `ticket returned ${response.status}`);
      return response.json();
    },
    async createGroup(session, wsId, participantUserIds) {
      const body = await json(session, `${chat(wsId)}/conversations`, {
        body: JSON.stringify({
          participantUserIds,
          title: 'Realtime qualification',
          type: 'group',
        }),
        method: 'POST',
      });
      check(body.conversation?.id, 'conversation create returned no id');
      return body.conversation;
    },
    async send(session, wsId, conversationId, content) {
      const body = await json(
        session,
        `${chat(wsId)}/conversations/${conversationId}/messages`,
        {
          body: JSON.stringify({
            clientRequestId: crypto.randomUUID(),
            content,
          }),
          method: 'POST',
        }
      );
      check(body.message?.id, 'message send returned no id');
      return body.message;
    },
    async messages(session, wsId, conversationId) {
      const body = await json(
        session,
        `${chat(wsId)}/conversations/${conversationId}/messages?limit=50`
      );
      return Array.isArray(body) ? body : (body.messages ?? []);
    },
    leave(session, wsId, conversationId) {
      return json(session, `${chat(wsId)}/conversations/${conversationId}`, {
        method: 'DELETE',
      });
    },
  };
}

/** Path shape without identifiers, for failure messages. */
function label(path) {
  return path.replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/giu,
    ':id'
  );
}
