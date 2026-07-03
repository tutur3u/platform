import { NextResponse } from 'next/server';
import { isAIWhitelistEmailEnabled } from '@/lib/ai-whitelist/email-repository';
import { withSessionAuth } from '@/lib/api-auth';
import { serverLogger } from '@/lib/infrastructure/log-drain';

export const GET = withSessionAuth(
  async (_request, { user }) => {
    try {
      if (!user.email) {
        return NextResponse.json({ email: null, enabled: false });
      }

      const enabled = await isAIWhitelistEmailEnabled(user.email);

      return NextResponse.json({
        email: user.email,
        enabled,
      });
    } catch (error) {
      serverLogger.error('Error checking current AI whitelist email:', error);
      return NextResponse.json(
        { message: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { allowAppSessionAuth: true }
);
