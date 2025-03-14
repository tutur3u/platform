import { OAuth2Client } from 'google-auth-library';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');

  if (!code) {
    return NextResponse.json({ error: 'No code provided' }, { status: 400 });
  }

  const auth = new OAuth2Client({
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: process.env.GOOGLE_REDIRECT_URI,
  });

  try {
    const { tokens } = await auth.getToken(code);
    const redirectUrl = `/calendar?access_token=${tokens.access_token}&refresh_token=${tokens.refresh_token}`;
    return NextResponse.redirect(new URL(redirectUrl, request.url), 302);
  } catch (error) {
    console.error('Error during OAuth callback:', error);
    return NextResponse.json({ error: 'Xác thực thất bại' }, { status: 500 });
  }
}
