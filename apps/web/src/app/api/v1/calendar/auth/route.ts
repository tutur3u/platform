import { OAuth2Client } from '@tuturuuu/google';
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
    scope: [
      'https://www.googleapis.com/auth/calendar', // Full calendar access
      'https://www.googleapis.com/auth/userinfo.email', // Get user email
      'https://www.googleapis.com/auth/userinfo.profile', // Get user profile/name
    ],
    prompt: 'consent',
    access_type: 'offline',
  });

  return NextResponse.json({ authUrl }, { status: 200 });
}
