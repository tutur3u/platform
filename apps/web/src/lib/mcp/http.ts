import {
  authorizeMcp,
  type VerifyMcpJwt,
  validateMcpConfig,
} from './authorization';
import {
  McpAccessError,
  type McpActor,
  type McpAuthority,
  type McpConfig,
  type McpReads,
} from './contracts';
import { HostedMcpReads } from './read-service';

export type McpTransport = {
  // The standard SDK owns protocol parsing/negotiation. One fresh instance/request.
  dispatch(request: Request, reads: HostedMcpReads): Promise<Response>;
};
export type HostedMcpDependencies = {
  authority: McpAuthority;
  verify: VerifyMcpJwt;
  reads(actor: McpActor): McpReads;
  readAuthority?(actor: McpActor): McpAuthority;
  transport(): McpTransport;
};

function errorResponse(status: number, message: string, metadataUrl: string) {
  const headers = new Headers({
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json',
  });
  if (status === 401)
    headers.set(
      'WWW-Authenticate',
      `Bearer resource_metadata="${metadataUrl}"`
    );
  return Response.json({ error: message }, { status, headers });
}

async function boundedRequest(request: Request) {
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader) {
    try {
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.length;
        if (size > 65536) {
          await reader.cancel();
          throw new McpAccessError(413, 'MCP request is too large.');
        }
        chunks.push(part.value);
      }
    } finally {
      reader.releaseLock();
    }
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  // This slice permits one JSON-RPC message/request to bound work and effects.
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new McpAccessError(400, 'Invalid MCP request.');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new McpAccessError(400, 'MCP batches are unavailable.');
  return new Request(request.url, {
    method: 'POST',
    headers: request.headers,
    body: bytes,
    signal: request.signal,
  });
}

// Source factory only: deliberately not registered as a Next route/public endpoint.
export function createHostedMcpHandler(
  config: McpConfig,
  dependencies: HostedMcpDependencies
) {
  validateMcpConfig(config);
  return async (request: Request): Promise<Response> => {
    try {
      const url = new URL(request.url);
      const expected = new URL(config.resource);
      if (
        url.origin !== expected.origin ||
        url.pathname !== expected.pathname ||
        url.search ||
        (request.headers.has('host') &&
          request.headers.get('host')?.toLowerCase() !== expected.host)
      ) {
        throw new McpAccessError(403, 'MCP request origin is invalid.');
      }
      const origin = request.headers.get('origin');
      if (origin && !config.allowedOrigins.has(origin))
        throw new McpAccessError(403, 'MCP request origin is invalid.');
      if (request.method !== 'POST') {
        const response = errorResponse(
          405,
          'Use POST for stateless MCP requests.',
          config.metadataUrl
        );
        response.headers.set('Allow', 'POST');
        return response;
      }
      if (
        !/^application\/json(?:\s*;|$)/iu.test(
          request.headers.get('content-type') ?? ''
        )
      ) {
        return errorResponse(
          415,
          'Use application/json for MCP.',
          config.metadataUrl
        );
      }
      if (request.headers.has('mcp-session-id'))
        throw new McpAccessError(400, 'MCP sessions are stateless.');
      const actor = await authorizeMcp(
        request,
        config,
        dependencies.authority,
        dependencies.verify
      );
      const bounded = await boundedRequest(request);
      const response = await dependencies
        .transport()
        .dispatch(
          bounded,
          new HostedMcpReads(
            actor,
            dependencies.readAuthority?.(actor) ?? dependencies.authority,
            dependencies.reads(actor)
          )
        );
      // No CORS wildcard, session cookie, credential envelope, or CDN caching.
      const headers = new Headers(response.headers);
      headers.set('Cache-Control', 'no-store');
      headers.delete('set-cookie');
      headers.delete('mcp-session-id');
      headers.delete('access-control-allow-origin');
      headers.delete('access-control-allow-credentials');
      return new Response(response.body, { status: response.status, headers });
    } catch (error) {
      // Provider, API, validation and SDK failures must never leak raw messages.
      return errorResponse(
        error instanceof McpAccessError ? error.status : 503,
        error instanceof McpAccessError
          ? error.message
          : 'MCP request is unavailable.',
        config.metadataUrl
      );
    }
  };
}

export function protectedResourceMetadata(config: McpConfig) {
  validateMcpConfig(config);
  // No user data; registration/issuer readiness remains a parent-approved gate.
  return {
    resource: config.resource,
    authorization_servers: [config.issuer],
    bearer_methods_supported: ['header'],
  };
}
