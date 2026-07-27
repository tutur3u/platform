import {
  checkAiCredits,
  deductAiCredits,
} from '@tuturuuu/ai/credits/check-credits';
import { resolveAiMemoryWorkspaceIdForUser } from '@tuturuuu/ai/memory/workspace';
import { type NextRequest, NextResponse } from 'next/server';
import { type SessionAuthContext, withSessionAuth } from '@/lib/api-auth';

const MODEL = 'gemini-2.0-flash';

async function transcribeAudio(
  req: NextRequest,
  { supabase, user }: SessionAuthContext
) {
  try {
    const { base64Audio } = await req.json();
    if (
      typeof base64Audio !== 'string' ||
      !base64Audio ||
      base64Audio.length > 8_000_000
    ) {
      return NextResponse.json(
        { error: 'Valid audio data is required' },
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
      Math.ceil(base64Audio.length / 1000)
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
            'AI credits are required for audio transcription.',
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
                  text: "Please convert this audio into correct text, and return only the text, no other text or comments. If you can't understand the audio, or there is no audio, return an empty string.",
                },
                {
                  inline_data: {
                    mime_type: 'audio/webm',
                    data: base64Audio,
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
      metadata: { surface: 'calendar_audio_transcription' },
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

export const POST = withSessionAuth(transcribeAudio, {
  allowAppSessionAuth: { targetApp: 'calendar' },
  maxPayloadSize: 8_500_000,
  rateLimit: { maxRequests: 10, windowMs: 60_000 },
  rateLimitKind: 'read',
});
