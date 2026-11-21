import { TRUSTED_TYPES_DIRECTIVES } from './csp';

export const CSP_REPORT_PATH = '/api/csp-report';
const MAX_BYTES = 16 * 1024;
let windowStart = 0;
let count = 0;
const directives = new Set([
  'script-src',
  'script-src-elem',
  'script-src-attr',
  'require-trusted-types-for',
  'trusted-types',
]);

/** Bounded, credential-free diagnostics: never echo or log report payloads. */
export async function collectDocumentSecurityReport(request: Request) {
  const done = () =>
    new Response(null, {
      status: 204,
      headers: { 'Cache-Control': 'no-store' },
    });
  if (request.method !== 'POST')
    return new Response(null, { status: 405, headers: { Allow: 'POST' } });
  if (Number(request.headers.get('content-length')) > MAX_BYTES) return done();
  const reader = request.body?.getReader();
  if (!reader) return done();
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { done: finished, value } = await reader.read();
      if (finished) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        return done();
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const payload: unknown = JSON.parse(new TextDecoder().decode(bytes));
    const entries: unknown[] = Array.isArray(payload)
      ? payload
          .slice(0, 10)
          .map((entry) =>
            entry && typeof entry === 'object' && 'body' in entry
              ? entry.body
              : null
          )
      : [
          payload && typeof payload === 'object' && 'csp-report' in payload
            ? payload['csp-report']
            : null,
        ];
    if (Date.now() - windowStart > 60_000) {
      windowStart = Date.now();
      count = 0;
    }
    for (const entry of entries) {
      if (!entry || typeof entry !== 'object' || count >= 50) continue;
      const directive =
        'effective-directive' in entry
          ? entry['effective-directive']
          : 'effectiveDirective' in entry
            ? entry.effectiveDirective
            : undefined;
      count += 1;
      console.warn('document security violation', {
        directive:
          typeof directive === 'string' && directives.has(directive)
            ? directive
            : 'unknown',
        disposition:
          'disposition' in entry && entry.disposition === 'enforce'
            ? 'enforce'
            : 'report',
      });
    }
  } catch {
    return done();
  }
  return done();
}

/** Applies only to owned HTML with a nonce CSP, never forwarded API documents. */
export function secureBridgeDocument(
  response: Response,
  options: {
    request: Request;
    env: unknown;
    app: string;
    basePath: string;
    policies?: readonly string[];
  }
) {
  const { request, env, app, basePath } = options;
  const path = new URL(request.url).pathname.slice(basePath.length) || '/';
  const csp = response.headers.get('Content-Security-Policy');
  if (
    !response.headers
      .get('Content-Type')
      ?.toLowerCase()
      .startsWith('text/html') ||
    !csp?.includes("'strict-dynamic'") ||
    path === '/api' ||
    path.startsWith('/api/')
  )
    return response;
  const name = `TTR_TRUSTED_TYPES_${app.toUpperCase()}`;
  const binding =
    env && typeof env === 'object' && name in env
      ? Reflect.get(env, name)
      : undefined;
  const enforced = binding === 'enforce';
  const target = `${TRUSTED_TYPES_DIRECTIVES}${options.policies?.length ? ` ${options.policies.join(' ')}` : ''}`;
  const reporting = `report-uri ${basePath}${CSP_REPORT_PATH}`;
  const result = new Response(response.body, response);
  if (enforced) {
    result.headers.set(
      'Content-Security-Policy',
      `${csp}; ${target}; ${reporting}`
    );
    result.headers.delete('Content-Security-Policy-Report-Only');
  } else {
    result.headers.set(
      'Content-Security-Policy-Report-Only',
      `${target}; ${reporting}`
    );
  }
  return result;
}
