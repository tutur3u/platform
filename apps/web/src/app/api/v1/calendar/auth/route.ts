import { OAuth2Client } from 'google-auth-library';
import { type NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const wsId = request.nextUrl.searchParams.get('wsId');

  if (!wsId) {
    return NextResponse.json({ error: 'wsId is required' }, { status: 400 });
  }

  const auth = new OAuth2Client({
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: process.env.GOOGLE_REDIRECT_URI,
  });

  const authUrl = auth.generateAuthUrl({
    state: wsId,
    scope: ['https://www.googleapis.com/auth/calendar.events'],
    prompt: 'consent',
    access_type: 'offline',
  });

  return NextResponse.json({ authUrl }, { status: 200 });
}
