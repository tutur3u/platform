import { google } from 'googleapis';
import { type NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const wsId = request.nextUrl.searchParams.get('wsId');

  if (!wsId) {
    return NextResponse.json({ error: 'wsId is required' }, { status: 400 });
  }

  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  const authUrl = auth.generateAuthUrl({
    state: wsId,
    scope: ['https://www.googleapis.com/auth/calendar.events'],
    prompt: 'consent',
    access_type: 'offline',
  });

  return NextResponse.json({ authUrl }, { status: 200 });
}
