/**
 * HOTFIX containment: the legacy web meeting AI endpoint is disabled.
 * POST returns 403 before any auth, Supabase, credit/usage, or provider work.
 * Meeting AI lives in Tuturuuu Meet.
 */
const LEGACY_MEETING_AI_DISABLED = {
  error:
    'Meeting AI on this page has been turned off. Use Meet AI in Tuturuuu Meet.',
  code: 'LEGACY_MEETING_AI_DISABLED',
} as const;

export async function POST(_req: Request): Promise<Response> {
  return Response.json(LEGACY_MEETING_AI_DISABLED, { status: 403 });
}
