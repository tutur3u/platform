import { z } from 'zod';
import { McpAccessError, type McpConfig, uuid } from './contracts';
import type { McpProviderClient } from './provider';

const identity = z.object({ id: uuid });
const grants = z
  .array(z.object({ client: z.object({ id: z.string().min(1).max(512) }) }))
  .max(100);

// auth-js listGrants() uses its local session even with a global bearer header.
// Do not fabricate a refresh session to satisfy it. These two documented provider
// GETs use the same installed SDK response contracts with this request's JWT.
export function createProviderReadClient(
  config: McpConfig,
  publishableKey: string,
  token: string,
  fetchImpl: typeof fetch = fetch
): McpProviderClient {
  const issuer = new URL(config.issuer);
  if (
    issuer.protocol !== 'https:' ||
    issuer.username ||
    issuer.password ||
    issuer.search ||
    issuer.hash ||
    !publishableKey.startsWith('sb_publishable_')
  )
    throw new McpAccessError(503, 'MCP provider configuration is unavailable.');
  const read = async (
    path: '/user' | '/user/oauth/grants'
  ): Promise<unknown> => {
    const response = await fetchImpl(
      `${config.issuer.replace(/\/$/u, '')}${path}`,
      {
        method: 'GET',
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
        headers: {
          apikey: publishableKey,
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(5000),
      }
    );
    if (!response.ok || !response.body) {
      await response.body?.cancel();
      throw new McpAccessError(
        response.status === 401 || response.status === 403 ? 401 : 503,
        'MCP provider authorization is unavailable.'
      );
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        length += part.value.byteLength;
        if (length > 65536) {
          await reader.cancel();
          throw new McpAccessError(
            503,
            'MCP provider response is unavailable.'
          );
        }
        chunks.push(part.value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return JSON.parse(new TextDecoder().decode(bytes));
  };
  return {
    auth: {
      async getUser(requestToken) {
        if (requestToken !== token)
          throw new McpAccessError(401, 'MCP provider actor changed.');
        return {
          data: { user: identity.parse(await read('/user')) },
          error: null,
        };
      },
      oauth: {
        async listGrants() {
          return {
            data: grants.parse(await read('/user/oauth/grants')),
            error: null,
          };
        },
      },
    },
  };
}
