/**
 * Microsoft OAuth Initiation Route
 *
 * Generates Microsoft OAuth authorization URL for Outlook calendar integration.
 */

import {
  ConfidentialClientApplication,
  createMsalConfig,
  MICROSOFT_CALENDAR_SCOPES,
  type MicrosoftOAuthConfig,
} from '@tuturuuu/microsoft';
import { type NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const wsId = request.nextUrl.searchParams.get('wsId');

  if (!wsId) {
    return NextResponse.json({ error: 'wsId is required' }, { status: 400 });
  }

  const config: MicrosoftOAuthConfig = {
    clientId: process.env.MICROSOFT_CLIENT_ID || '',
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET || '',
    tenantId: process.env.MICROSOFT_TENANT_ID || 'common',
    redirectUri: process.env.MICROSOFT_REDIRECT_URI || '',
  };

  if (!config.clientId || !config.clientSecret || !config.redirectUri) {
    return NextResponse.json(
      { error: 'Microsoft OAuth not configured' },
      { status: 500 }
    );
  }

  try {
    const msalConfig = createMsalConfig(config);
    const cca = new ConfidentialClientApplication(msalConfig);

    const authUrl = await cca.getAuthCodeUrl({
      scopes: MICROSOFT_CALENDAR_SCOPES,
      redirectUri: config.redirectUri,
      state: wsId,
      prompt: 'consent',
    });

    return NextResponse.json({ authUrl }, { status: 200 });
  } catch (error) {
    console.error('Error generating Microsoft auth URL:', error);
    return NextResponse.json(
      { error: 'Failed to generate authentication URL' },
      { status: 500 }
    );
  }
}
