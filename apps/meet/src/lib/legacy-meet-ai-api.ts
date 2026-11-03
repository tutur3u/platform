/**
 * The legacy web Meet AI routes under /api/ai/meetings (transcription,
 * summary) call the AI provider from apps/web. They are never forwarded
 * through the Meet Worker's /api fallback proxy, with no exceptions.
 */
export function isLegacyMeetAiApi(pathname: string) {
  let path = pathname;
  try {
    path = decodeURIComponent(pathname);
  } catch {
    // Undecodable paths are matched as received.
  }
  return /^\/api\/+ai\/+meetings(?:\/|$)/i.test(path.replace(/\/{2,}/g, '/'));
}

export const LEGACY_MEET_AI_API_BODY = {
  code: 'MEET_AI_WORKSPACE_NOT_ENABLED',
  error: 'Meet AI is temporarily unavailable',
} as const;
export const LEGACY_MEET_AI_API_HEADERS = {
  'Cache-Control': 'private, no-store',
} as const;
