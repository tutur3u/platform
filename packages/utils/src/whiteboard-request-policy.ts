import type { NextRequest } from 'next/server';

const MAX_WHITEBOARD_SAVE_BYTES = 8 * 1024 * 1024;

export function whiteboardSaveByteLimit(
  request: Pick<NextRequest, 'method' | 'nextUrl'>
): number | undefined {
  return request.method.toUpperCase() === 'PATCH' &&
    /^\/api\/v1\/workspaces\/[^/]+\/whiteboards\/[^/]+$/.test(
      request.nextUrl.pathname
    )
    ? MAX_WHITEBOARD_SAVE_BYTES
    : undefined;
}
