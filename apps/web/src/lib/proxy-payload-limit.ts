import type { NextRequest } from 'next/server';
import { externalProjectUploadProxyPayloadLimit } from './external-projects/upload-proxy-payload-limit';
import { feedbackProxyPayloadLimit } from './product-feedback-limits';
import { profileMediaProxyPayloadLimit } from './profile-media-proxy';

/** Per-route body caps for the Web proxy guard; undefined keeps its default. */
export function webProxyPayloadLimit(
  req: Pick<NextRequest, 'headers' | 'method' | 'nextUrl'>
) {
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
