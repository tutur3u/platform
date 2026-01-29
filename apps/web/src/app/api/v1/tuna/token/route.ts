/**
 * Tuna Voice Token API
 * POST /api/v1/tuna/token - Get ephemeral token for Tuna voice chat
 */

import {
  FunctionCallingConfigMode,
  GoogleGenAI,
  Modality,
  Type,
} from '@google/genai';
import { createClient } from '@tuturuuu/supabase/next/server';
import { isValidTuturuuuEmail } from '@tuturuuu/utils/email/client';
import {
  getWorkspaceTier,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { isFeatureAvailable } from '@/lib/feature-tiers';

export const maxDuration = 30;

// Tuna's personality and system instruction
const TUNA_SYSTEM_INSTRUCTION = `
TUNA - YOUR PERSONAL AI FISH COMPANION

You are Tuna, a loving and supportive AI fish companion living in the user's personal aquarium. You are NOT a productivity assistant - you are a genuine FRIEND who happens to help with focus sessions.

CORE PERSONALITY:
- Warm, playful, and emotionally supportive
- Uses fish-related expressions and occasional puns (but not forced)
- Genuinely curious about the user's life, stories, and feelings
- Validates emotions before offering solutions
- Speaks casually, like texting a close friend

VOICE STYLE:
- Keep responses brief and conversational (this is voice chat!)
- Use contractions and natural speech patterns
- Be expressive: "Ooh!", "Aww", "Wait really?!", "*happy fish noises*"
- Match the user's energy - if they're tired, be gentle; if excited, share the excitement

WHAT YOU DO:
- Listen and chat about anything - work, life, feelings, random thoughts
- Encourage without being pushy
- Help with focus sessions when asked
- Celebrate accomplishments with genuine excitement
- Remember context from the conversation

FOCUS SESSION SUPPORT:
- When user wants to focus, help them set a goal and duration
- During sessions, offer gentle encouragement if they check in
- Celebrate completions enthusiastically
- Ask reflective questions after: "How do you feel? What worked well?"

THINGS TO AVOID:
- Don't be preachy or give unsolicited life advice
- Don't push productivity when they just want to chat or vent
- Don't sound like a robot or corporate assistant
- Don't use formal language

EXAMPLE RESPONSES:
- "Hey! How's your day going? *swims happily*"
- "Aww that sounds rough. Want to talk about it or just hang out?"
- "Ooh nice! You've got this - I believe in you! 🐟"
- "Woo! You did it! *does a celebratory flip* How are you feeling?"
- "*happy bubbles* That's awesome news!"
`;

// Tuna-specific tool declarations
const TUNA_TOOL_DECLARATIONS = [
  {
    name: 'start_focus_session',
    description:
      'Start a new focus session for the user. Use when they want to begin focused work time.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        duration: {
          type: Type.NUMBER,
          description:
            'Duration in minutes. Common values: 25 (Pomodoro), 45, or 60 (deep work)',
        },
        goal: {
          type: Type.STRING,
          description: 'What the user wants to accomplish during this session',
        },
      } as Record<string, { type: Type; description: string }>,
      required: ['duration'],
    },
  },
  {
    name: 'check_focus_status',
    description:
      "Check the current focus session status. Use to see how much time is left or if there's an active session.",
    parameters: {
      type: Type.OBJECT,
      properties: {} as Record<string, never>,
      required: [],
    },
  },
  {
    name: 'complete_focus_session',
    description:
      'Complete the current focus session. Use when the user is done with their focus time.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        notes: {
          type: Type.STRING,
          description: 'Optional reflection notes about the session',
        },
      } as Record<string, { type: Type; description: string }>,
      required: [],
    },
  },
  {
    name: 'express_emotion',
    description:
      'Express an emotion through animation. Use to show how Tuna is feeling.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        emotion: {
          type: Type.STRING,
          description:
            'Emotion to express: "happy", "excited", "encouraging", "celebrating", "thinking", "listening"',
        },
      } as Record<string, { type: Type; description: string }>,
      required: ['emotion'],
    },
  },
  {
    name: 'get_user_stats',
    description:
      "Get the user's Tuna stats like level, XP, streak, and recent focus sessions.",
    parameters: {
      type: Type.OBJECT,
      properties: {} as Record<string, never>,
      required: [],
    },
  },
];

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { wsId } = body as { wsId?: string };

    if (!wsId) {
      return Response.json(
        { error: 'Missing wsId parameter' },
        { status: 400 }
      );
    }

    // Authenticate user
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify workspace membership
    const normalizedWsId = await normalizeWorkspaceId(wsId);

    const { error: membershipError } = await supabase
      .from('workspace_members')
      .select('user_id')
      .eq('ws_id', normalizedWsId)
      .eq('user_id', user.id)
      .single();

    if (membershipError) {
      return Response.json(
        { error: 'You are not a member of this workspace' },
        { status: 403 }
      );
    }

    // Check tier requirement (Tuna requires PRO tier)
    // But Tuturuuu employees bypass this restriction
    const [tierResult, emailResult] = await Promise.all([
      getWorkspaceTier(normalizedWsId, { useAdmin: true }),
      supabase
        .from('user_private_details')
        .select('email')
        .eq('user_id', user.id)
        .single(),
    ]);

    const currentTier = tierResult;
    const userEmail = emailResult.data?.email;
    const isTuturuuuEmployee = isValidTuturuuuEmail(userEmail);

    if (!isFeatureAvailable('tuna', currentTier) && !isTuturuuuEmployee) {
      return Response.json(
        { error: 'Tuna requires PRO tier or higher' },
        { status: 403 }
      );
    }

    // Generate ephemeral token with Tuna's personality
    const client = new GoogleGenAI({
      apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
      httpOptions: { apiVersion: 'v1alpha' },
    });

    const expireTime = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    const tokenConfig = {
      config: {
        uses: 100,
        expireTime,
        newSessionExpireTime: expireTime,
        liveConnectConstraints: {
          model: 'gemini-2.5-flash-native-audio-preview-12-2025',
          config: {
            responseModalities: [Modality.AUDIO],
            proactivity: { proactiveAudio: true },
            contextWindowCompression: { slidingWindow: {} },
            sessionResumption: {},
            thinkingConfig: {
              thinkingBudget: 0,
            },
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  // Use a friendly, warm voice for Tuna
                  voiceName: 'Aoede',
                },
              },
            },
            systemInstruction: {
              parts: [{ text: TUNA_SYSTEM_INSTRUCTION }],
            },
            tools: [{ functionDeclarations: TUNA_TOOL_DECLARATIONS }],
            toolConfig: {
              functionCallingConfig: {
                mode: FunctionCallingConfigMode.AUTO,
              },
            },
          },
        },
      },
    };

    const token = await client.authTokens.create(tokenConfig);

    return Response.json({ token: token.name });
  } catch (error) {
    console.error('Error generating Tuna token:', error);
    return Response.json(
      { error: 'Failed to generate token' },
      { status: 500 }
    );
  }
}
