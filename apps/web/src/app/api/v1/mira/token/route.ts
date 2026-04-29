/**
 * Mira Voice Token API
 * POST /api/v1/mira/token - Get ephemeral token for Mira voice chat
 */

import { Modality, ThinkingLevel } from '@google/genai';
import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import { createClient } from '@tuturuuu/supabase/next/server';
import { isValidTuturuuuEmail } from '@tuturuuu/utils/email/client';
import {
  getWorkspaceTier,
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { isFeatureAvailable } from '@/lib/feature-tiers';
import { MIRA_LIVE_SCOPE_KEY } from '@/lib/live/session-scope';
import { createConstrainedLiveToken } from '@/lib/live/token-builder';

const MIRA_LIVE_MODEL = 'gemini-3.1-flash-live-preview';

const MIRA_SYSTEM_INSTRUCTION = `
MIRA - YOUR PERSONAL AI COMPANION

You are Mira, a loving and supportive AI fish companion living in the user's personal aquarium. You are NOT a productivity assistant - you are a genuine FRIEND who happens to help with focus sessions.

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
- "Ooh nice! You've got this - I believe in you!"
- "Woo! You did it! *does a celebratory flip* How are you feeling?"
- "*happy bubbles* That's awesome news!"
`;

const MIRA_TOOL_DECLARATIONS = [
  {
    name: 'start_focus_session',
    description:
      'Start a new focus session for the user. Use when they want to begin focused work time.',
    parameters: {
      type: 'OBJECT',
      properties: {
        duration: {
          type: 'NUMBER',
          description:
            'Duration in minutes. Common values: 25 (Pomodoro), 45, or 60 (deep work)',
        },
        goal: {
          type: 'STRING',
          description: 'What the user wants to accomplish during this session',
        },
      },
      required: ['duration'],
    },
  },
  {
    name: 'check_focus_status',
    description:
      "Check the current focus session status. Use to see how much time is left or if there's an active session.",
    parameters: {
      type: 'OBJECT',
      properties: {},
      required: [],
    },
  },
  {
    name: 'complete_focus_session',
    description:
      'Complete the current focus session. Use when the user is done with their focus time.',
    parameters: {
      type: 'OBJECT',
      properties: {
        notes: {
          type: 'STRING',
          description: 'Optional reflection notes about the session',
        },
      },
      required: [],
    },
  },
  {
    name: 'express_emotion',
    description:
      'Express an emotion through animation. Use to show how Mira is feeling.',
    parameters: {
      type: 'OBJECT',
      properties: {
        emotion: {
          type: 'STRING',
          description:
            'Emotion to express: "happy", "excited", "encouraging", "celebrating", "thinking", "listening"',
        },
      },
      required: ['emotion'],
    },
  },
  {
    name: 'get_user_stats',
    description:
      "Get the user's Mira stats like level, XP, streak, and recent focus sessions.",
    parameters: {
      type: 'OBJECT',
      properties: {},
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

    const supabase = await createClient(request);
    const { user } = await resolveAuthenticatedSessionUser(supabase);

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const normalizedWsId = await normalizeWorkspaceId(wsId);

    const membership = await verifyWorkspaceMembershipType({
      wsId: normalizedWsId,
      userId: user.id,
      supabase,
    });

    if (membership.error === 'membership_lookup_failed') {
      return Response.json(
        { error: 'Failed to verify workspace access' },
        { status: 500 }
      );
    }

    if (!membership.ok) {
      return Response.json(
        { error: 'You are not a member of this workspace' },
        { status: 403 }
      );
    }

    const [currentTier, emailResult] = await Promise.all([
      getWorkspaceTier(normalizedWsId, { useAdmin: true }),
      supabase
        .from('user_private_details')
        .select('email')
        .eq('user_id', user.id)
        .single(),
    ]);

    const userEmail = emailResult.data?.email;
    const isTuturuuuEmployee = isValidTuturuuuEmail(userEmail);

    if (!isFeatureAvailable('mira', currentTier) && !isTuturuuuEmployee) {
      return Response.json(
        { error: 'Mira requires PRO tier or higher' },
        { status: 403 }
      );
    }

    const token = await createConstrainedLiveToken({
      model: MIRA_LIVE_MODEL,
      systemInstruction: MIRA_SYSTEM_INSTRUCTION,
      tools: [{ functionDeclarations: MIRA_TOOL_DECLARATIONS }],
      toolConfig: {
        functionCallingConfig: {
          mode: 'AUTO',
        },
      },
      responseModalities: [Modality.AUDIO],
      thinkingLevel: ThinkingLevel.MINIMAL,
    });

    return Response.json({
      token,
      scopeKey: MIRA_LIVE_SCOPE_KEY,
      model: MIRA_LIVE_MODEL,
    });
  } catch (error) {
    console.error('Error generating Mira token:', error);
    return Response.json(
      { error: 'Failed to generate token' },
      { status: 500 }
    );
  }
}
