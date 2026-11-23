import { isTrustedRealtimeServiceRequest } from '@tuturuuu/utils/realtime-service-ticket';
import type { NextRequest } from 'next/server';
import { externalProjectUploadProxyPayloadLimit } from './external-projects/upload-proxy-payload-limit';
import { feedbackProxyPayloadLimit } from './product-feedback-limits';
import { profileMediaProxyPayloadLimit } from './profile-media-proxy';

/** Per-route body caps for the Web proxy guard; undefined keeps its default. */
export function webProxyPayloadLimit(
  req: Pick<NextRequest, 'headers' | 'method' | 'nextUrl'>
) {
  const { pathname } = req.nextUrl;
  if (
    (pathname === '/api/v1/internal/playground-execution/export' ||
      pathname === '/api/v1/realtime/programming/checkpoint' ||
      pathname === '/api/v1/realtime/whiteboard/checkpoint') &&
    isTrustedRealtimeServiceRequest(pathname, req.headers, req.method)
  ) {
    return 3 * 1024 * 1024;
  }
  return (
    profileMediaProxyPayloadLimit(req.method, req.nextUrl) ??
    feedbackProxyPayloadLimit(req.method, req.nextUrl.pathname) ??
    externalProjectUploadProxyPayloadLimit(
      req.method,
      req.nextUrl.pathname,
      req.headers.get('content-type')
    )
  );
}
