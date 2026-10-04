import 'server-only';
import { randomUUID } from 'node:crypto';
import {
  rewritePreviewAsset,
  rewritePreviewHtml,
} from './playground-preview-assets';
import {
  PREVIEW_CAPABILITY_SEGMENT,
  previewCapabilityPrefix,
  readPreviewCapability,
} from './playground-preview-capability';
import { executePlayground, getPlaygroundRun } from './playground-service';

/** Authenticated callers supply an owner and, only after room admission, a meeting scope. */
export async function playgroundPreviewResponse(input: {
  ownerId: string;
  projectId: string;
  port: number;
  path: string;
  prefix: string;
  meetingId?: string;
  roomId?: string;
}) {
  if (!Number.isInteger(input.port) || input.port < 1024 || input.port > 65535)
    throw new Error('Invalid preview port');
  const prefix = previewCapabilityPrefix(input);
  const { runId } = await executePlayground(
    input.ownerId,
    input.projectId,
    'preview',
    randomUUID(),
    { port: input.port, path: input.path },
    input.meetingId
  );
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const result = await getPlaygroundRun(
      input.ownerId,
      input.projectId,
      runId
    );
    if (result.status === 'failed') break;
    if (result.status === 'succeeded' && result.preview) {
      const data = JSON.parse(result.preview) as Record<string, unknown>;
      if (
        typeof data.status !== 'number' ||
        !Number.isInteger(data.status) ||
        data.status < 200 ||
        data.status > 599 ||
        typeof data.contentType !== 'string' ||
        data.contentType.length > 256 ||
        /[\r\n]/.test(data.contentType) ||
        typeof data.body !== 'string' ||
        data.body.length > 699052 ||
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
          data.body
        )
      )
        throw new Error('Invalid preview response');
      let body: Uint8Array = Buffer.from(data.body, 'base64');
      if (body.byteLength > 524288) throw new Error('Preview exceeds limit');
      if (data.contentType.toLowerCase().includes('text/html')) {
        body = Buffer.from(
          rewritePreviewHtml(Buffer.from(body).toString('utf8'), prefix)
        );
      }
      if (/javascript|ecmascript|text\/css/i.test(data.contentType)) {
        body = Buffer.from(
          rewritePreviewAsset(
            Buffer.from(body).toString('utf8'),
            data.contentType,
            prefix
          )
        );
      }
      // Never forward app cookies, redirects, authorization headers or arbitrary response headers.
      return new Response(
        [204, 205, 304].includes(data.status) ? null : (body as BodyInit),
        {
          status: data.status,
          headers: {
            'Cache-Control': 'private, no-store',
            'Content-Type': data.contentType,
            'X-Content-Type-Options': 'nosniff',
            'Access-Control-Allow-Origin': '*',
            'Content-Security-Policy':
              "sandbox allow-scripts allow-forms; default-src 'self' data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'",
            'Referrer-Policy': 'no-referrer',
          },
        }
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return new Response('Preview unavailable', {
    status: 503,
    headers: { 'Cache-Control': 'no-store' },
  });
}

/** Resolve only the reserved capability path; ordinary requests still require app auth. */
export async function playgroundCapabilityResponse(input: {
  request: Request;
  port: number;
  path: string[];
  prefix: string;
  projectId?: string;
  roomId?: string;
}): Promise<Response | null> {
  if (input.path[0] !== PREVIEW_CAPABILITY_SEGMENT) return null;
  try {
    const token = input.path[1] ?? '';
    const scope = readPreviewCapability(token, input);
    return await playgroundPreviewResponse({
      ownerId: scope.ownerId,
      projectId: scope.projectId,
      port: scope.port,
      meetingId: scope.meetingId,
      roomId: scope.roomId,
      path: `/${input.path.slice(2).map(encodeURIComponent).join('/')}${new URL(input.request.url).search}`,
      prefix: `${input.prefix}${PREVIEW_CAPABILITY_SEGMENT}/${token}/`,
    });
  } catch {
    return new Response('Preview unavailable', {
      status: 403,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  }
}
