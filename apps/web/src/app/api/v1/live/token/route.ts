import { createClient } from '@tuturuuu/supabase/next/server';
import { isValidTuturuuuEmail } from '@tuturuuu/utils/email/client';
import { GoogleGenAI, Modality } from '@google/genai';

export const maxDuration = 30;

export async function POST() {
  try {
    // 1. Authenticate user
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Validate Tuturuuu email
    if (!isValidTuturuuuEmail(user.email)) {
      return Response.json(
        { error: 'Only Tuturuuu emails are allowed' },
        { status: 403 }
      );
    }

    // 3. Generate ephemeral token with model constraints
    // Use v1alpha API version for native audio features
    const client = new GoogleGenAI({
      apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
      httpOptions: { apiVersion: 'v1alpha' },
    });
    const expireTime = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 mins

    const token = await client.authTokens.create({
      config: {
        // Allow multiple session attempts (useful for reconnects and development)
        uses: 10,
        expireTime,
        // Allow session to start anytime within the token's validity window
        newSessionExpireTime: expireTime,
        liveConnectConstraints: {
          model: 'gemini-2.5-flash-native-audio-preview-09-2025',
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: 'Aoede',
                },
              },
            },
          },
        },
      },
    });

    return Response.json({ token: token.name });
  } catch (error) {
    console.error('Error generating ephemeral token:', error);
    return Response.json(
      { error: 'Failed to generate token' },
      { status: 500 }
    );
  }
}
