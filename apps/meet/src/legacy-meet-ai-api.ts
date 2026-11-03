/**
 * Containment hotfix (03a410b3 line): the legacy web Meet AI routes under
 * /api/ai/meetings (transcription, summary) call the AI provider from apps/web
 * with no Meet workspace gate on this line. They are never forwarded through
 * the Meet Worker's /api fallback proxy.
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
