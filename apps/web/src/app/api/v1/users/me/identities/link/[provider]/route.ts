import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';

const ProviderSchema = z.enum(['google', 'github']);

function buildReturnUrl(
  request: NextRequest,
  rawReturnTo: string | null,
  provider: string
) {
  const fallback = new URL('/', request.url);
  const candidate = rawReturnTo
    ? new URL(rawReturnTo, request.nextUrl.origin)
    : fallback;

  if (candidate.origin !== request.nextUrl.origin) {
    return fallback.toString();
  }

  candidate.searchParams.set('settingsDialog', 'open');
  candidate.searchParams.set('settingsTab', 'security');
  candidate.searchParams.set('settingsLinkedProvider', provider);

  return candidate.toString();
}

export const GET = withSessionAuth<{ provider: string }>(
  async (request, { supabase }, { provider }) => {
    const parsedProvider = ProviderSchema.safeParse(provider);

    if (!parsedProvider.success) {
      return NextResponse.json(
        { message: 'Unsupported provider' },
        { status: 400 }
      );
    }

    try {
      const redirectTo = buildReturnUrl(
        request,
        request.nextUrl.searchParams.get('returnTo'),
        parsedProvider.data
      );

      const { data, error } = await supabase.auth.linkIdentity({
        provider: parsedProvider.data,
        options: { redirectTo },
      });

      if (error || !data?.url) {
        return NextResponse.json(
          { message: error?.message || 'Failed to start identity linking' },
          { status: 400 }
        );
      }

      return NextResponse.redirect(data.url);
    } catch (error) {
      console.error('Error starting identity linking:', error);
      return NextResponse.json(
        { message: 'Internal server error' },
        { status: 500 }
      );
    }
  }
);
