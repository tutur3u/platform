/**
 * The legacy web meeting summary route is retired: it always answers 403
 * before auth, Supabase, usage or provider work, whatever MEET_AI_* is set to.
 */
async function POST(_request: Request) {
  return Response.json(
    {
      code: 'LEGACY_MEETING_AI_DISABLED',
      error: 'Legacy meeting summaries are disabled. Use Meet AI notes.',
    },
    { status: 403, headers: { 'Cache-Control': 'private, no-store' } }
  );
}

export { POST };
