import { google } from '@ai-sdk/google';
import {
  checkAiCredits,
  deductAiCredits,
} from '@tuturuuu/ai/credits/check-credits';
import { toBareModelName } from '@tuturuuu/ai/credits/model-mapping';
import {
  PlanModelResolutionError,
  resolvePlanModel,
} from '@tuturuuu/ai/credits/resolve-plan-model';
import { withAiMemory } from '@tuturuuu/ai/memory';
import { resolveWorkspaceId } from '@tuturuuu/utils/constants';
import { isExactTuturuuuDotComEmail } from '@tuturuuu/utils/email/client';
import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import { generateObject } from 'ai';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { type AuthorizedRequest, withSessionAuth } from '@/lib/api-auth';
import { serverLogger } from '@/lib/infrastructure/log-drain';

type Params = {
  wsId: string;
};

const ScenarioRequestSchema = z.object({
  mode: z
    .enum([
      'parent_update',
      'pronunciation_lab',
      'regional_classroom',
      'sentiment_lab',
      'surprise',
    ])
    .optional(),
  prompt: z.string().trim().max(800).optional(),
  seed: z.string().trim().max(120).optional(),
});

const SentimentHypothesisSchema = z.object({
  emotions: z.array(z.string().min(2).max(32)).min(1).max(5),
  intent: z.string().min(2).max(80),
  mood: z.string().min(2).max(64),
  risk: z.string().min(2).max(80),
});

const VoicePresetSchema = z.object({
  engine: z.literal('piper'),
  language: z.string().min(2).max(64),
  pace: z.number().min(0.6).max(1.4),
  speakerId: z.number().int().min(0).max(999).optional(),
  voiceId: z.string().min(2).max(120),
});

const ScenarioSchema = z.object({
  classroomContext: z.string().min(12).max(420),
  expectedConfusions: z.array(z.string().min(2).max(120)).min(2).max(5),
  learnerLine: z.string().min(6).max(240),
  learnerPersona: z.string().min(8).max(180),
  outputType: z.enum([
    'action_items',
    'email_summary',
    'interview_notes',
    'key_quotes',
    'meeting_minutes',
    'service_log',
    'subtitles',
  ]),
  referencePhrase: z.string().min(12).max(700),
  researchQuestion: z.string().min(8).max(180),
  rubric: z.array(z.string().min(8).max(160)).min(3).max(5),
  scenarioTags: z.array(z.string().min(2).max(32)).min(3).max(7),
  sentimentHypothesis: SentimentHypothesisSchema,
  sourceLanguage: z.enum([
    'auto',
    'chinese',
    'english',
    'filipino',
    'malay',
    'singlish',
    'tamil',
    'thai',
    'vietnamese',
  ]),
  targetLanguage: z.enum([
    'chinese',
    'english',
    'filipino',
    'malay',
    'thai',
    'vietnamese',
  ]),
  teacherGoal: z.string().min(8).max(180),
  title: z.string().min(6).max(80),
  voice: VoicePresetSchema,
});

const DEFAULT_PIPER_VOICE_ID = 'en_US-lessac-high';

const FALLBACK_SCENARIOS: z.infer<typeof ScenarioSchema>[] = [
  {
    classroomContext:
      'A mixed English and Vietnamese IELTS class is practicing inference questions after a short reading passage.',
    expectedConfusions: [
      'infer versus guess',
      'context clue wording',
      'final consonant clarity',
    ],
    learnerLine:
      'I can infer the writer is worried because the paragraph says the river level kept rising overnight.',
    learnerPersona:
      'An intermediate Vietnamese learner who understands the lesson but sounds hesitant when explaining evidence.',
    outputType: 'action_items',
    referencePhrase:
      'I can infer the writer is worried because the paragraph says the river level kept rising overnight.',
    researchQuestion:
      'Can Valsea separate hesitation from incorrect inference reasoning?',
    rubric: [
      'Check whether infer is pronounced clearly.',
      'Listen for final consonants in writer, kept, and overnight.',
      'Give the learner one short repair drill.',
    ],
    scenarioTags: ['IELTS', 'Vietnamese learner', 'pronunciation lab'],
    sentimentHypothesis: {
      emotions: ['hesitant', 'focused'],
      intent: 'ask for confirmation',
      mood: 'uncertain but engaged',
      risk: 'medium confusion risk',
    },
    sourceLanguage: 'english',
    targetLanguage: 'vietnamese',
    teacherGoal:
      'Turn the learner voice note into a pronunciation-aware micro practice plan.',
    title: 'Inference answer rescue',
    voice: {
      engine: 'piper',
      language: 'english',
      pace: 0.94,
      voiceId: DEFAULT_PIPER_VOICE_ID,
    },
  },
  {
    classroomContext:
      'A Singapore secondary math class is comparing two linear graphs and the teacher wants parent-safe follow-up notes.',
    expectedConfusions: [
      'slope versus intercept',
      'Singlish filler words',
      'graph comparison phrasing',
    ],
    learnerLine:
      'I can compare the two graphs by checking which line has a steeper slope and a higher y-intercept.',
    learnerPersona:
      'A confident SEA learner who code-switches when the concept becomes abstract.',
    outputType: 'email_summary',
    referencePhrase:
      'I can compare the two graphs by checking which line has a steeper slope and a higher y-intercept.',
    researchQuestion:
      'Can Valsea preserve Singlish classroom cues while producing parent-safe feedback?',
    rubric: [
      'Identify whether slope and intercept are said distinctly.',
      'Separate conceptual confusion from pronunciation friction.',
      'Generate a parent-friendly follow-up.',
    ],
    scenarioTags: ['Singapore', 'math', 'parent update'],
    sentimentHypothesis: {
      emotions: ['confused', 'confident'],
      intent: 'request clarification',
      mood: 'stuck but willing',
      risk: 'conceptual confusion',
    },
    sourceLanguage: 'singlish',
    targetLanguage: 'english',
    teacherGoal:
      'Create a concise home update and a next-step practice prompt.',
    title: 'Slope and intercept check-in',
    voice: {
      engine: 'piper',
      language: 'english',
      pace: 0.9,
      voiceId: DEFAULT_PIPER_VOICE_ID,
    },
  },
  {
    classroomContext:
      'A Filipino coding club is preparing students to explain recursion during a short oral demo.',
    expectedConfusions: [
      'recursive call wording',
      'base case stress',
      'technical vocabulary confidence',
    ],
    learnerLine:
      'The function calls itself with a smaller input until it reaches the base case.',
    learnerPersona:
      'A beginner programmer who can run the code but struggles to explain the algorithm aloud.',
    outputType: 'interview_notes',
    referencePhrase:
      'The function calls itself with a smaller input until it reaches the base case.',
    researchQuestion:
      'Can sentiment and pronunciation evidence reveal whether the learner is memorizing or understanding?',
    rubric: [
      'Grade clarity on function, smaller, and base case.',
      'Detect whether the explanation is memorized or understood.',
      'Produce coaching notes for the next oral demo.',
    ],
    scenarioTags: ['coding', 'Filipino learner', 'oral demo'],
    sentimentHypothesis: {
      emotions: ['nervous', 'determined'],
      intent: 'rehearse explanation',
      mood: 'performance anxiety',
      risk: 'low confidence risk',
    },
    sourceLanguage: 'english',
    targetLanguage: 'filipino',
    teacherGoal: 'Prepare interview-style notes and a spoken rehearsal plan.',
    title: 'Recursion oral demo',
    voice: {
      engine: 'piper',
      language: 'english',
      pace: 0.92,
      voiceId: DEFAULT_PIPER_VOICE_ID,
    },
  },
];

async function verifyAccess(context: AuthorizedRequest, wsId: string) {
  const resolvedWsId = resolveWorkspaceId(wsId);
  const membership = await verifyWorkspaceMembershipType({
    supabase: context.supabase,
    userId: context.user.id,
    wsId: resolvedWsId,
  });

  if (membership.error === 'membership_lookup_failed') {
    return NextResponse.json(
      { message: 'Could not verify workspace membership' },
      { status: 500 }
    );
  }

  if (!membership.ok) {
    return NextResponse.json(
      { message: "You don't have access to this workspace" },
      { status: 403 }
    );
  }

  return null;
}

function pickFallbackScenario(seed: string | undefined) {
  const source = seed || `${Date.now()}`;
  const index =
    [...source].reduce(
      (total, character) => total + character.charCodeAt(0),
      0
    ) % FALLBACK_SCENARIOS.length;
  return FALLBACK_SCENARIOS[index] ?? FALLBACK_SCENARIOS[0];
}

async function isInternalMiraUser(context: AuthorizedRequest) {
  if (isExactTuturuuuDotComEmail(context.user.email)) {
    return true;
  }

  const { data } = await context.supabase
    .from('user_private_details')
    .select('email')
    .eq('user_id', context.user.id)
    .maybeSingle();

  return isExactTuturuuuDotComEmail(data?.email);
}

export const POST = withSessionAuth<Params>(
  async (request, context, { wsId }) => {
    const accessError = await verifyAccess(context, wsId);
    if (accessError) return accessError;

    if (!(await isInternalMiraUser(context))) {
      return NextResponse.json(
        {
          error:
            'Mira scenario generation is limited to @tuturuuu.com accounts',
        },
        { status: 403 }
      );
    }

    const rawBody = (await request.json().catch(() => ({}))) as unknown;
    const parsed = ScenarioRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Invalid scenario request' },
        { status: 400 }
      );
    }

    const fallback = pickFallbackScenario(parsed.data.seed);
    const resolvedWsId = resolveWorkspaceId(wsId);

    try {
      const resolvedModel = await resolvePlanModel({
        capability: 'language',
        wsId: resolvedWsId,
      });
      const modelId = resolvedModel.modelId;
      const bareModelId = toBareModelName(modelId);
      const creditCheck = await checkAiCredits(
        resolvedWsId,
        modelId,
        'generate',
        { userId: context.user.id }
      );
      if (!creditCheck.allowed) {
        return NextResponse.json(
          {
            error: creditCheck.errorMessage || 'AI credits insufficient',
            code: creditCheck.errorCode,
          },
          { status: 403 }
        );
      }

      const { object, usage } = await generateObject({
        model: await withAiMemory({
          customId: `valsea-scenario-${Date.now()}`,
          model: google(bareModelId),
          product: 'education',
          source: 'valsea_scenario',
          surface: 'valsea_scenario',
          userId: context.user.id,
          wsId: resolvedWsId,
        }),
        schema: ScenarioSchema,
        system:
          'You are Mira, Tuturuuu’s internal education assistant. Create realistic, demo-ready classroom voice lab scenarios for a Valsea edtech hackathon. Keep them useful for teachers and rich enough for sentiment, pronunciation, and provider-observability research.',
        prompt: `Create one vivid classroom scenario for Valsea Classroom Studio.

Mode: ${parsed.data.mode ?? 'surprise'}
Seed: ${parsed.data.seed ?? 'random'}
User prompt: ${parsed.data.prompt || 'none'}

The result must include:
- a learner voice phrase that can be pasted as a reference transcript,
- learnerLine equal to the exact phrase the generated voice should speak,
- a Piper voice preset using engine "piper", voiceId "${DEFAULT_PIPER_VOICE_ID}" unless another Piper voice is clearly better, and a clear STT-friendly pace from 0.85 to 0.95,
- a sentiment hypothesis with mood, emotions, intent, and risk,
- a research question for the observability drawer,
- tags for the UI,
- likely pronunciation or comprehension confusions,
- a teacher goal,
- a grading rubric,
- a source language and target language supported by the page,
- one output type supported by the Valsea formatting API.

Avoid generic language. Make it feel like a real classroom moment.`,
      });

      deductAiCredits({
        wsId: resolvedWsId,
        userId: context.user.id,
        modelId,
        inputTokens: usage.inputTokens ?? 0,
        outputTokens: usage.outputTokens ?? 0,
        reasoningTokens:
          usage.outputTokenDetails?.reasoningTokens ??
          usage.reasoningTokens ??
          0,
        feature: 'generate',
      }).catch((error: unknown) =>
        serverLogger.warn('Failed to deduct Valsea scenario credits', error)
      );

      return NextResponse.json(object);
    } catch (error) {
      if (error instanceof PlanModelResolutionError) {
        return NextResponse.json(
          { error: error.message, code: error.code },
          { status: error.code === 'NO_ALLOCATION' ? 503 : 500 }
        );
      }

      serverLogger.warn('Falling back to local Valsea scenario seed', error);
      return NextResponse.json(fallback);
    }
  },
  {
    rateLimit: { maxRequests: 12, windowMs: 60_000 },
  }
);
