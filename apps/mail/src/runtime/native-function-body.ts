import { retarget } from '@tuturuuu/start-bridge/base-path';
import {
  MAIL_FUNCTION_BASE,
  MAIL_LEGACY_FUNCTION_BASE,
  nativeMethodStatus,
} from './mail-api-policy';
import { mailAppPath } from './mail-mount';
export const MAIL_FUNCTION_BODY_LIMIT = 1024 * 1024;
export async function boundNativeFunctionRequest(
  request: Request
): Promise<Request | Response> {
  if (
    request.method !== 'POST' ||
    nativeMethodStatus(request.method, request.headers.get('content-type')) !==
      200
  )
    return request;
  if (Number(request.headers.get('content-length')) > MAIL_FUNCTION_BODY_LIMIT)
    return new Response(null, { status: 413 });
  const reader = request.body?.getReader();
  if (!reader) return request;
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAIL_FUNCTION_BODY_LIMIT) {
        await reader.cancel();
        return new Response(null, { status: 413 });
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new Request(request, { body: bytes });
}

export async function prepareMailFunctionRequest(request: Request) {
  const path = mailAppPath(request);
  if (
    path === MAIL_LEGACY_FUNCTION_BASE ||
    path?.startsWith(`${MAIL_LEGACY_FUNCTION_BASE}/`)
  ) {
    const url = new URL(request.url);
    url.pathname =
      url.pathname.slice(0, -path.length) +
      MAIL_FUNCTION_BASE +
      path.slice(MAIL_LEGACY_FUNCTION_BASE.length);
    request = retarget(request, url);
  } else if (
    path !== MAIL_FUNCTION_BASE &&
    !path?.startsWith(`${MAIL_FUNCTION_BASE}/`)
  ) {
    return request;
  }
  return boundNativeFunctionRequest(request);
}
