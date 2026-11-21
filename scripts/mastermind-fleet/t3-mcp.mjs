// Local T3 MCP client for the Mastermind fleet bridge. It signs in to this
// machine's own T3 Code server over loopback the way any outside MCP client
// does (OAuth authorization code with PKCE), approved by a short-lived local
// session that the `t3` CLI mints and that is revoked straight after. The
// resulting MCP token is cached in a mode-0600 file and never leaves this
// machine: every request goes to `http://127.0.0.1:<port>` and nowhere else.
// Runbook: apps/docs/platform/features/mastermind-thread-replies.mdx#steered-delivery
import { execFile } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { readPrivateFile, writePrivateFile } from './private-files.mjs';

const LOOPBACK_ORIGIN = /^http:\/\/127\.0\.0\.1:\d{2,5}$/;
const REDIRECT_URI = 'http://127.0.0.1/mastermind-fleet-bridge/callback';
const CLIENT_NAME = 'Mastermind fleet bridge';
const HTTP_TIMEOUT_MS = 5_000;
const CLI_TIMEOUT_MS = 20_000;
/** A cached token this close to expiry is replaced before use. */
const EXPIRY_MARGIN_MS = 60_000;
/** Becomes a `t3` CLI argument, so it may never look like a flag. */
const SESSION_ID = /^[\w:.][\w:.-]{0,199}$/;

/**
 * What a session needs to approve each MCP access level. `auto` is the least
 * that may message a thread; `full-access` is required to reach threads that
 * themselves run with full access (T3 refuses a narrower sender).
 */
const APPROVER_SCOPES = {
  auto: ['access:write', 'orchestration:read', 'orchestration:operate'],
  'full-access': [
    'access:write',
    'orchestration:read',
    'orchestration:operate',
    'settings:write',
    'source-control:write',
  ],
};

export class T3McpError extends Error {
  /** `code` is from a closed set; `detail` may quote the server and is never logged. */
  constructor(code, detail) {
    super(code);
    this.name = 'T3McpError';
    this.code = code;
    this.detail = detail;
  }
}

export function localT3Paths(home = os.homedir()) {
  return {
    runtimeFile: path.join(home, '.t3/userdata/server-runtime.json'),
    t3Bin: path.join(home, '.t3/bin/t3'),
    tokenFile: path.join(home, '.local/share/fleet-sync/t3-mcp-token.json'),
    journalFile: path.join(
      home,
      '.local/share/fleet-sync/t3-steer-journal.jsonl'
    ),
  };
}

/** The running server's loopback origin, or null when it is not running here. */
export function readLocalOrigin(runtimeFile) {
  try {
    // T3 owns this file and its mode; it must still be a regular file of ours.
    const text = readPrivateFile(runtimeFile, { privateMode: false });
    const { origin } = JSON.parse(text ?? 'null') ?? {};
    return typeof origin === 'string' && LOOPBACK_ORIGIN.test(origin)
      ? origin
      : null;
  } catch {
    return null;
  }
}

function runCli(t3Bin, args) {
  return new Promise((resolve, reject) => {
    execFile(
      t3Bin,
      args,
      { timeout: CLI_TIMEOUT_MS, maxBuffer: 256 * 1024 },
      (error, stdout) =>
        error ? reject(new T3McpError('t3_cli_failed')) : resolve(stdout)
    );
  });
}

/** Mints and revokes the approving session through the local `t3` CLI. */
export function cliSessions(t3Bin) {
  return {
    async issue(scopes) {
      const out = await runCli(t3Bin, [
        'auth',
        'session',
        'issue',
        '--ttl',
        '5m',
        '--label',
        'mastermind-fleet-bridge approval',
        '--json',
        ...scopes.flatMap((scope) => ['--scope', scope]),
      ]);
      let issued;
      try {
        issued = JSON.parse(out);
      } catch {
        throw new T3McpError('t3_cli_failed');
      }
      if (
        typeof issued?.token !== 'string' ||
        !SESSION_ID.test(String(issued?.sessionId ?? ''))
      )
        throw new T3McpError('t3_cli_failed');
      return { token: issued.token, sessionId: issued.sessionId };
    },
    async revoke(sessionId) {
      await runCli(t3Bin, ['auth', 'session', 'revoke', sessionId]);
    },
  };
}

async function postJson(fetchImpl, origin, pathname, body, headers = {}) {
  let response;
  try {
    response = await fetchImpl(new URL(pathname, origin).href, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      redirect: 'error',
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });
  } catch {
    throw new T3McpError('t3_unreachable');
  }
  if (!response.ok) throw new T3McpError(`t3_oauth_${response.status}`);
  try {
    return await response.json();
  } catch {
    throw new T3McpError('t3_oauth_invalid');
  }
}

/**
 * Runs the whole sign-in and returns `{ token, expiresAt }`. The approving
 * session exists only between the approval and decision requests and is
 * revoked even when a step fails.
 */
export async function acquireMcpToken({
  origin,
  sessions,
  access = 'full-access',
  fetchImpl = fetch,
  now = Date.now,
}) {
  if (!LOOPBACK_ORIGIN.test(String(origin)))
    throw new T3McpError('t3_origin_not_loopback');
  const scopes = APPROVER_SCOPES[access];
  if (!scopes) throw new T3McpError('t3_access_invalid');

  const client = await postJson(fetchImpl, origin, '/oauth/mcp/register', {
    client_name: CLIENT_NAME,
    redirect_uris: [REDIRECT_URI],
  });
  if (typeof client?.client_id !== 'string')
    throw new T3McpError('t3_oauth_invalid');

  const verifier = randomBytes(32).toString('base64url');
  const state = randomBytes(16).toString('base64url');
  const authorization = {
    response_type: 'code',
    client_id: client.client_id,
    redirect_uri: REDIRECT_URI,
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
    state,
    resource: `${origin}/mcp`,
  };

  let code;
  const session = await sessions.issue(scopes);
  try {
    const bearer = { authorization: `Bearer ${session.token}` };
    const details = await postJson(
      fetchImpl,
      origin,
      '/oauth/mcp/approval',
      authorization,
      bearer
    );
    if (
      typeof details?.csrfToken !== 'string' ||
      !Array.isArray(details.oneClickAccess) ||
      !details.oneClickAccess.includes(access)
    )
      throw new T3McpError('t3_approval_unavailable');
    const decided = await postJson(
      fetchImpl,
      origin,
      '/oauth/mcp/decision',
      {
        authorization,
        decision: {
          _tag: 'browser-session',
          access,
          csrfToken: details.csrfToken,
        },
      },
      bearer
    );
    let redirect;
    try {
      redirect = new URL(decided?.redirectTo);
    } catch {
      throw new T3McpError('t3_oauth_invalid');
    }
    // The code is only taken from our own redirect target, for our own state.
    if (
      `${redirect.origin}${redirect.pathname}` !== REDIRECT_URI ||
      redirect.searchParams.get('state') !== state ||
      !redirect.searchParams.get('code')
    )
      throw new T3McpError('t3_approval_denied');
    code = redirect.searchParams.get('code');
  } finally {
    await sessions.revoke(session.sessionId).catch(() => undefined);
  }

  let response;
  try {
    response = await fetchImpl(new URL('/oauth/mcp/token', origin).href, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
        client_id: client.client_id,
        code_verifier: verifier,
        resource: `${origin}/mcp`,
      }).toString(),
      redirect: 'error',
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });
  } catch {
    throw new T3McpError('t3_unreachable');
  }
  if (!response.ok) throw new T3McpError(`t3_oauth_${response.status}`);
  const issued = await response.json().catch(() => null);
  if (
    typeof issued?.access_token !== 'string' ||
    !Number.isFinite(issued?.expires_in)
  )
    throw new T3McpError('t3_oauth_invalid');
  return {
    token: issued.access_token,
    expiresAt: new Date(now() + issued.expires_in * 1000).toISOString(),
  };
}

/** The cached token for `origin` and `access`, or null when missing, loose or near expiry. */
export function readCachedToken(file, { origin, access, now = Date.now }) {
  try {
    const cached = JSON.parse(readPrivateFile(file) ?? 'null');
    if (
      cached?.origin !== origin ||
      cached?.access !== access ||
      typeof cached?.token !== 'string' ||
      !(Date.parse(cached?.expiresAt) - now() > EXPIRY_MARGIN_MS)
    )
      return null;
    return cached.token;
  } catch {
    return null;
  }
}

export function writeCachedToken(file, value) {
  writePrivateFile(file, `${JSON.stringify(value)}\n`);
}

function rpcReply(contentType, text, id) {
  const messages = String(contentType).includes('text/event-stream')
    ? text
        .split(/\r?\n\r?\n/)
        .map((event) =>
          event
            .split(/\r?\n/)
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice(5).replace(/^ /, ''))
            .join('\n')
        )
        .filter(Boolean)
        .map((data) => JSON.parse(data))
    : [JSON.parse(text)];
  const reply = messages.flat().find((message) => message?.id === id);
  if (!reply || reply.jsonrpc !== '2.0' || reply.error || !reply.result)
    throw new T3McpError('t3_rpc_error');
  return reply.result;
}

/**
 * Opens one MCP session. `call(name, args)` resolves to the tool's structured
 * result, and throws `t3_tool_error` (with the server's sentence in `detail`)
 * when the tool refuses. A 401 while opening throws `t3_unauthorized`.
 */
export async function openMcpSession({
  origin,
  token,
  fetchImpl = fetch,
  timeoutMs = 15_000,
}) {
  const endpoint = new URL('/mcp', origin).href;
  let sessionId;
  let protocolVersion;
  let id = 0;
  const send = async (method, params, notify = false) => {
    const requestId = notify ? undefined : ++id;
    let response;
    try {
      response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          ...(sessionId ? { 'mcp-session-id': sessionId } : {}),
          ...(protocolVersion
            ? { 'mcp-protocol-version': protocolVersion }
            : {}),
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method,
          params,
          ...(notify ? {} : { id: requestId }),
        }),
        redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new T3McpError('t3_unreachable');
    }
    sessionId = response.headers.get('mcp-session-id') ?? sessionId;
    if (response.status === 401) throw new T3McpError('t3_unauthorized');
    if (!response.ok) throw new T3McpError(`t3_http_${response.status}`);
    const text = await response.text();
    if (notify) return undefined;
    try {
      return rpcReply(response.headers.get('content-type'), text, requestId);
    } catch (error) {
      throw error instanceof T3McpError
        ? error
        : new T3McpError('t3_rpc_error');
    }
  };
  const init = await send('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'mastermind-fleet-bridge', version: '1' },
  });
  if (typeof init.protocolVersion !== 'string')
    throw new T3McpError('t3_rpc_error');
  protocolVersion = init.protocolVersion;
  await send('notifications/initialized', {}, true);
  return {
    /** Names the bearer without revealing it: T3 keys idempotency by it. */
    bearerId: createHash('sha256').update(token).digest('hex').slice(0, 16),
    async call(name, args) {
      const result = await send('tools/call', { name, arguments: args });
      const text = result.content?.find(
        (part) => typeof part?.text === 'string'
      )?.text;
      if (result.isError) {
        let detail = text;
        try {
          detail = JSON.parse(text)?.message ?? text;
        } catch {
          // Plain-text failure.
        }
        throw new T3McpError('t3_tool_error', detail);
      }
      if (
        result.structuredContent &&
        typeof result.structuredContent === 'object'
      )
        return result.structuredContent;
      try {
        return JSON.parse(text);
      } catch {
        throw new T3McpError('t3_rpc_error');
      }
    },
    async close() {
      if (!sessionId) return;
      await fetchImpl(endpoint, {
        method: 'DELETE',
        headers: {
          authorization: `Bearer ${token}`,
          'mcp-session-id': sessionId,
          ...(protocolVersion
            ? { 'mcp-protocol-version': protocolVersion }
            : {}),
        },
        redirect: 'error',
        signal: AbortSignal.timeout(2_000),
      }).catch(() => undefined);
    },
  };
}

/**
 * Opens a session against the local server, signing in when there is no
 * usable cached token and once more when the server no longer accepts it.
 * The caller closes the returned session.
 */
export async function connectLocalMcp({
  home = os.homedir(),
  access = 'full-access',
  fetchImpl = fetch,
  now = Date.now,
  sessions,
  paths = localT3Paths(home),
} = {}) {
  const origin = readLocalOrigin(paths.runtimeFile);
  if (!origin) throw new T3McpError('t3_not_running');
  const signIn = async () => {
    const issued = await acquireMcpToken({
      origin,
      access,
      fetchImpl,
      now,
      sessions: sessions ?? cliSessions(paths.t3Bin),
    });
    writeCachedToken(paths.tokenFile, { origin, access, ...issued });
    return issued.token;
  };
  const cached = readCachedToken(paths.tokenFile, { origin, access, now });
  try {
    return await openMcpSession({
      origin,
      token: cached ?? (await signIn()),
      fetchImpl,
    });
  } catch (error) {
    if (!cached || error?.code !== 't3_unauthorized') throw error;
    // The server restarted or revoked the cached token: sign in once more.
    return openMcpSession({ origin, token: await signIn(), fetchImpl });
  }
}
