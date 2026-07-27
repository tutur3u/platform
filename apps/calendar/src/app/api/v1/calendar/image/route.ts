import {
  checkAiCredits,
  deductAiCredits,
} from '@tuturuuu/ai/credits/check-credits';
import { resolveAiMemoryWorkspaceIdForUser } from '@tuturuuu/ai/memory/workspace';
import { type NextRequest, NextResponse } from 'next/server';
import { type SessionAuthContext, withSessionAuth } from '@/lib/api-auth';

const MODEL = 'gemini-2.0-flash';

async function extractEventsFromImage(
  req: NextRequest,
  { supabase, user }: SessionAuthContext
) {
  try {
    const { base64Image } = await req.json();
    if (
      typeof base64Image !== 'string' ||
      !base64Image ||
      base64Image.length > 8_000_000
    ) {
      return NextResponse.json(
        { error: 'Valid image data is required' },
        { status: 400 }
      );
    }

    const billingWorkspaceId = await resolveAiMemoryWorkspaceIdForUser({
      fallbackWsId: '',
      supabase,
      userId: user.id,
    });
    const estimatedInputTokens = Math.max(
      1,
      Math.ceil(base64Image.length / 1000)
    );
    const creditCheck = await checkAiCredits(
      billingWorkspaceId,
      MODEL,
      'generate',
      { estimatedInputTokens, userId: user.id }
    );
    if (!creditCheck.allowed) {
      return NextResponse.json(
        {
          code: creditCheck.errorCode,
          error:
            creditCheck.errorMessage ??
            'AI credits are required for image extraction.',
        },
        { status: 403 }
      );
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/${MODEL}:generateContent?key=${process.env.GOOGLE_GENERATIVE_AI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: 'Extract all events, times, and locations from the image, arrange them in chronological order. The output should be natural language text for one or many calendar events.',
                },
                {
                  inline_data: {
                    mime_type: 'image/jpeg',
                    data: base64Image,
                  },
                },
              ],
            },
          ],
        }),
      }
    );

    const result = await response.json();

    if (!result?.candidates) {
      return NextResponse.json(
        { error: 'Invalid response from Gemini' },
        { status: 500 }
      );
    }

    const text = result.candidates[0]?.content?.parts?.[0]?.text || '';
    const deduction = await deductAiCredits({
      feature: 'generate',
      inputTokens:
        result.usageMetadata?.promptTokenCount ?? estimatedInputTokens,
      metadata: { surface: 'calendar_image_event_extraction' },
      modelId: MODEL,
      outputTokens:
        result.usageMetadata?.candidatesTokenCount ??
        Math.max(1, Math.ceil(text.length / 4)),
      reasoningTokens: result.usageMetadata?.thoughtsTokenCount ?? 0,
      userId: user.id,
      wsId: billingWorkspaceId,
    });
    if (!deduction.success) {
      return NextResponse.json(
        { code: deduction.errorCode, error: 'AI credit settlement failed' },
        { status: 503 }
      );
    }

    return NextResponse.json({ text });
  } catch (error) {
    console.error('❌ Error calling Gemini API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export const POST = withSessionAuth(extractEventsFromImage, {
  allowAppSessionAuth: { targetApp: 'calendar' },
  maxPayloadSize: 8_500_000,
  rateLimit: { maxRequests: 10, windowMs: 60_000 },
  rateLimitKind: 'read',
});
