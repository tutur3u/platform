import { BOOTSTRAP_VERSION } from '@tuturuuu/internal-api/user-bootstrap';
import { connection, NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';
import { BOOTSTRAP_APP_SESSION_AUTH } from './auth';
import { parseBootstrapRequest } from './params';
import { runBootstrapSections } from './sections';

export const BOOTSTRAP_HEADERS = { 'Cache-Control': 'private, no-store' };

/** Authenticated bootstrap read; the route adds the kill switch and timing. */
export const bootstrapHandler = withSessionAuth(
  async (request, { supabase, user }) => {
    await connection();

    const parsed = parseBootstrapRequest(request.url);
    if (!parsed) {
      return NextResponse.json(
        { error: 'invalid_request' },
        { status: 400, headers: BOOTSTRAP_HEADERS }
      );
    }

    // The actor always comes from the verified session or token; the client
    // value can only refuse the request, never select another actor.
    if (parsed.expectedActorId !== user.id) {
      return NextResponse.json(
        { message: 'Account changed' },
        { status: 409, headers: BOOTSTRAP_HEADERS }
      );
    }

    const sections = await runBootstrapSections({ supabase, user }, parsed);

    return NextResponse.json(
      { actorId: user.id, sections, version: BOOTSTRAP_VERSION },
      { headers: BOOTSTRAP_HEADERS }
    );
  },
  {
    allowAppSessionAuth: BOOTSTRAP_APP_SESSION_AUTH,
    rateLimitKind: 'read',
  }
);
