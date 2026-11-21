// Shared fakes for the T3 MCP helper tests: a scripted T3 server (OAuth
// endpoints plus an MCP endpoint) and the approving-session stub.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const ORIGIN = 'http://127.0.0.1:3773';
export const THREAD = 'thread:project:mcp%3Aabc:1234';
export const tempDir = (prefix = 't3-steer-') =>
  fs.mkdtempSync(path.join(os.tmpdir(), prefix));

export const json = (body, init = {}) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });

/**
 * A fake T3 server: the OAuth endpoints plus an MCP endpoint with scripted
 * tools. Like T3, it remembers a `clientRequestId` per bearer only.
 */
export function fakeServer({
  tools = {},
  access = ['auto', 'full-access'],
} = {}) {
  const log = [];
  const state = { tokens: new Set(), minted: 0, receipts: new Map() };
  const fetchImpl = async (url, init) => {
    const { pathname } = new URL(url);
    const body =
      init.headers['content-type'] === 'application/json'
        ? JSON.parse(init.body)
        : Object.fromEntries(new URLSearchParams(init.body ?? ''));
    log.push({ pathname, method: init.method, body, headers: init.headers });
    assert.equal(new URL(url).origin, ORIGIN);
    assert.equal(init.redirect, 'error');
    if (pathname === '/oauth/mcp/register') return json({ client_id: 'cid' });
    if (pathname === '/oauth/mcp/approval')
      return init.headers.authorization === 'Bearer approver'
        ? json({ csrfToken: 'csrf', oneClickAccess: access })
        : json({ clientName: 'x' });
    if (pathname === '/oauth/mcp/decision')
      return json({
        redirectTo: `${body.authorization.redirect_uri}?code=the-code&state=${body.authorization.state}`,
      });
    if (pathname === '/oauth/mcp/token') {
      const token = `mcp-${++state.minted}`;
      state.tokens.add(token);
      return json({ access_token: token, expires_in: 3600 });
    }
    if (pathname === '/mcp') {
      const token = init.headers.authorization.slice(7);
      if (!state.tokens.has(token)) return new Response('', { status: 401 });
      if (init.method === 'DELETE') return new Response('', { status: 200 });
      if (body.method === 'initialize')
        return json(
          { jsonrpc: '2.0', id: body.id, result: { protocolVersion: 'p1' } },
          {
            headers: {
              'content-type': 'application/json',
              'mcp-session-id': 's1',
            },
          }
        );
      if (body.method === 'notifications/initialized')
        return new Response('', { status: 202 });
      const { name, arguments: args } = body.params;
      const key = `${token}:${name}:${args.clientRequestId}`;
      // Replays within one bearer return the stored result; the tool does not run.
      let result = args.clientRequestId ? state.receipts.get(key) : undefined;
      if (!result) {
        result = tools[name](args);
        if (args.clientRequestId) state.receipts.set(key, result);
      }
      // SSE framing, as the real server answers tool calls.
      return new Response(
        `event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: body.id, result })}\n\n`,
        { status: 200, headers: { 'content-type': 'text/event-stream' } }
      );
    }
    return new Response('', { status: 404 });
  };
  const sessions = {
    issued: [],
    revoked: [],
    async issue(scopes) {
      this.issued.push(scopes);
      return { token: 'approver', sessionId: 'sess-1' };
    },
    async revoke(id) {
      this.revoked.push(id);
    },
  };
  return { fetchImpl, sessions, log, state };
}

export const ok = (structuredContent) => ({ structuredContent });
export const refused = (message) => ({
  isError: true,
  content: [{ type: 'text', text: JSON.stringify({ message }) }],
});
