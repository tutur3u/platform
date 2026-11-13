import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import { createClient } from '@tuturuuu/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';
import { legacyRecorderRetiredResponse } from '../../../_lib/legacy-recorder-lock';

/**
 * Legacy recorder complete-recording upload. The legacy recorder is retired, so this
 * route never parses, stores or records audio: every authenticated caller
 * receives the localized retirement refusal. Existing recordings are untouched.
 */
export async function POST(
  request: NextRequest,
  _context: {
    params: Promise<{ wsId: string; meetingId: string; sessionId: string }>;
  }
) {
  try {
    const supabase = await createClient();
    const { user, authError } = await resolveAuthenticatedSessionUser(supabase);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return legacyRecorderRetiredResponse(request);
  } catch (error) {
    console.error(
      'Error in legacy recording complete-recording upload API:',
      error
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
