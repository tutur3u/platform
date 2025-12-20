/**
 * Microsoft OAuth Initiation Route
 *
 * Generates Microsoft OAuth authorization URL for Outlook calendar integration.
 * Implements PKCE (Proof Key for Code Exchange) for security.
 */

import crypto from 'node:crypto';
import {
  ConfidentialClientApplication,
  createMsalConfig,
  MICROSOFT_CALENDAR_SCOPES,
} from '@tuturuuu/microsoft';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getMicrosoftOAuthConfig,
  isMicrosoftConfigComplete,
} from '@/lib/calendar/microsoft-config';
import { normalizeWorkspaceId } from '@/lib/workspace-helper';

const microsoftAuthQuerySchema = z.object({
  wsId: z.string(),
});

/**
 * Generate a cryptographically random code verifier for PKCE
 */
function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Generate a code challenge from the code verifier using SHA-256
 */
function generateCodeChallenge(verifier: string): string {
  const hash = crypto.createHash('sha256').update(verifier).digest();
  return Buffer.from(hash).toString('base64url');
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const queryParams = Object.fromEntries(url.searchParams.entries());

  const result = microsoftAuthQuerySchema.safeParse(queryParams);
  if (!result.success) {
    return NextResponse.json(
      { error: 'Missing or invalid workspace ID' },
      { status: 400 }
    );
  }

  const { wsId } = result.data;
  const normalizedWsId = await normalizeWorkspaceId(wsId);

  const config = getMicrosoftOAuthConfig();

  if (!isMicrosoftConfigComplete(config)) {
    return NextResponse.json(
      { error: 'Microsoft OAuth not configured' },
      { status: 500 }
    );
  }

  try {
    // Generate PKCE code verifier and challenge
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    const msalConfig = createMsalConfig(config);
    const cca = new ConfidentialClientApplication(msalConfig);

    const authUrl = await cca.getAuthCodeUrl({
      scopes: MICROSOFT_CALENDAR_SCOPES,
      redirectUri: config.redirectUri,
      state: normalizedWsId,
      prompt: 'consent',
      codeChallenge,
      codeChallengeMethod: 'S256',
    });

    // Create response with the auth URL
    const response = NextResponse.json({ authUrl }, { status: 200 });

    // Store code verifier in an HttpOnly cookie for the callback
    response.cookies.set('ms_pkce_verifier', codeVerifier, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 600, // 10 minutes
    });

    return response;
  } catch (error) {
    console.error('Error generating Microsoft auth URL:', error);
    return NextResponse.json(
      { error: 'Failed to generate authentication URL' },
      { status: 500 }
    );
  }
}
