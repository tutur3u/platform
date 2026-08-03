import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import { createClient } from '@tuturuuu/supabase/next/server';
import { z } from 'zod';
import { LiveBillingError, settleLiveBillingSession } from '@/lib/live/billing';

const TokenCount = z.number().int().min(0).max(100_000_000);
const RequestSchema = z.object({
  close: z.boolean().optional().default(false),
  liveSessionId: z.string().uuid(),
  sequence: z.number().int().min(0).max(1_000_000),
  usage: z.object({
    inputAudioTokens: TokenCount,
    inputImageTokens: TokenCount,
    inputTextTokens: TokenCount,
    inputVideoTokens: TokenCount,
    outputAudioTokens: TokenCount,
    outputTextTokens: TokenCount,
    searchQueries: z.number().int().min(0).max(10_000),
    thinkingTokens: TokenCount,
  }),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const supabase = await createClient(request);
  const { user } = await resolveAuthenticatedSessionUser(supabase);
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await settleLiveBillingSession({
      close: parsed.data.close,
      liveSessionId: parsed.data.liveSessionId,
      sequence: parsed.data.sequence,
      usage: parsed.data.usage,
      userId: user.id,
    });
    return Response.json(result, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    if (error instanceof LiveBillingError) {
      return Response.json(
        { code: error.code, error: error.message },
        { status: error.status }
      );
    }
    console.error('Unexpected Live usage settlement failure', error);
    return Response.json(
      { error: 'Unable to record Live usage.' },
      { status: 500 }
    );
  }
}
