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
import { createWorkspaceStorageSignedReadUrl } from '@tuturuuu/storage-core/workspace-storage-provider';
import { resolveWorkspaceId } from '@tuturuuu/utils/constants';
import { isExactTuturuuuDotComEmail } from '@tuturuuu/utils/email/client';
import { sanitizePath } from '@tuturuuu/utils/storage-path';
import { generateObject } from 'ai';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { type AuthorizedRequest, withSessionAuth } from '@/lib/api-auth';
import { checkEducationWorkspaceAccess } from '@/lib/education/access';
import {
  isValseaAudioStoragePath,
  MAX_VALSEA_AUDIO_UPLOAD_BYTES,
  validateFinalizedValseaAudioUpload,
} from '@/lib/valsea-audio-storage-policy';
import { gradeVoicePronunciation } from './voice-grading';

type Params = {
  wsId: string;
};

type SemanticTag = {
  meaning?: string;
  phrase?: string;
  tag?: string;
};

type ValseaRecord = Record<string, unknown>;

type ObservabilityStage = {
  durationMs?: number;
  id: string;
  inputSummary?: string;
  label: string;
  model?: string;
  outputSummary?: string;
  provider: string;
  raw?: unknown;
  status: 'error' | 'skipped' | 'success';
};

const SentimentEvidenceSpanSchema = z.object({
  end: z.number().int().min(0).optional(),
  label: z.string().min(2).max(48),
  quote: z.string().min(1).max(240),
  start: z.number().int().min(0).optional(),
});

const MiraSentimentSchema = z.object({
  arousal: z.number().min(0).max(100),
  confusion: z.number().min(0).max(100),
  confidence: z.number().min(0).max(100),
  emotions: z.array(z.string().min(2).max(32)).min(1).max(6),
  engagement: z.number().min(0).max(100),
  evidenceSpans: z.array(SentimentEvidenceSpanSchema).max(8),
  intent: z.string().min(2).max(80),
  parentSafeSummary: z.string().min(8).max(240),
  politeness: z.number().min(0).max(100),
  risk: z.string().min(2).max(80),
  sentiment: z.string().min(2).max(64),
  teacherMove: z.string().min(8).max(180),
  urgency: z.number().min(0).max(100),
  valence: z.number().min(-100).max(100),
});

const VALSEA_BASE_URL = 'https://api.valsea.ai/v1';
const PRONUNCIATION_MODELS = [
  'local-whisper-large-v3-turbo',
  'local-whisper-large-v3',
  'local-whisper-medium',
  'local-whisper-small',
  'local-whisper-base',
  'local-whisper-tiny',
  'local-wav2vec2',
] as const;
const DEFAULT_PRONUNCIATION_MODEL = 'local-whisper-large-v3-turbo';

const classroomSchema = z.object({
  audioFileName: z.string().trim().min(1).max(255).optional(),
  audioStoragePath: z.string().trim().min(1).max(1024).optional(),
  language: z.string().min(2).max(64).default('auto'),
  outputType: z
    .enum([
      'action_items',
      'email_summary',
      'interview_notes',
      'key_quotes',
      'meeting_minutes',
      'service_log',
      'subtitles',
    ])
    .default('action_items'),
  pronunciationModel: z
    .enum(PRONUNCIATION_MODELS)
    .default(DEFAULT_PRONUNCIATION_MODEL),
  targetLanguage: z.string().min(2).max(64).default('vietnamese'),
  transcript: z.string().trim().min(1).max(12_000).optional(),
});

type ClassroomPayload = z.infer<typeof classroomSchema> & {
  file?: File;
};

type ParsePayloadResult =
  | {
      data: ClassroomPayload;
      error?: never;
    }
  | {
      data?: never;
      error: NextResponse;
    };

function getString(record: ValseaRecord | undefined, key: string) {
  const value = record?.[key];
  return typeof value === 'string' ? value : undefined;
}

function getNumber(record: ValseaRecord | undefined, key: string) {
  const value = record?.[key];
  return typeof value === 'number' ? value : undefined;
}

function getStringArray(record: ValseaRecord | undefined, key: string) {
  const value = record?.[key];
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function getSemanticTags(record: ValseaRecord | undefined) {
  const value = record?.semantic_tags;
  if (!Array.isArray(value)) return [];

  return value
    .filter(
      (entry): entry is ValseaRecord =>
        !!entry && typeof entry === 'object' && !Array.isArray(entry)
    )
    .map<SemanticTag>((entry) => ({
      meaning: getString(entry, 'meaning'),
      phrase: getString(entry, 'phrase'),
      tag: getString(entry, 'tag'),
    }))
    .filter((entry) => entry.phrase || entry.tag || entry.meaning);
}

function parseValseaTextOutput(record: ValseaRecord | undefined) {
  if (!record) return '';

  const preferredKeys = [
    'formatted_text',
    'output',
    'result',
    'text',
    'content',
    'summary',
  ];

  for (const key of preferredKeys) {
    const value = getString(record, key);
    if (value) return value;
  }

  return JSON.stringify(record, null, 2);
}

function summarizeText(value: string | undefined, maxLength = 140) {
  if (!value) return undefined;
  const normalized = value.replace(/\s+/gu, ' ').trim();
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength - 1)}…`
    : normalized;
}

function getValseaSentimentLayer(sentiment: ValseaRecord) {
  return {
    confidence: getNumber(sentiment, 'confidence')
      ? Math.round((getNumber(sentiment, 'confidence') ?? 0) * 100)
      : undefined,
    emotions: getStringArray(sentiment, 'emotions'),
    provider: 'valsea' as const,
    raw: sentiment,
    sentiment: getString(sentiment, 'sentiment'),
  };
}

function getSentimentConsensus({
  mira,
  valsea,
}: {
  mira?: z.infer<typeof MiraSentimentSchema> | null;
  valsea: ValseaRecord;
}) {
  const miraSentiment = mira?.sentiment?.toLowerCase();
  const valseaSentiment = getString(valsea, 'sentiment')?.toLowerCase();

  if (miraSentiment && valseaSentiment && miraSentiment === valseaSentiment) {
    return 'strong_agreement';
  }

  if (mira?.emotions?.some((emotion) => valseaSentiment?.includes(emotion))) {
    return 'partial_agreement';
  }

  return mira ? 'needs_review' : 'valsea_only';
}

async function runObservedStage<T>({
  id,
  inputSummary,
  label,
  model,
  operation,
  outputSummary,
  provider,
  stages,
}: {
  id: string;
  inputSummary?: string;
  label: string;
  model?: string;
  operation: () => Promise<T>;
  outputSummary?: (result: T) => string | undefined;
  provider: string;
  stages: ObservabilityStage[];
}) {
  const startedAt = performance.now();

  try {
    const result = await operation();
    stages.push({
      durationMs: Math.round(performance.now() - startedAt),
      id,
      inputSummary,
      label,
      model,
      outputSummary: outputSummary?.(result),
      provider,
      raw: result,
      status: 'success',
    });
    return result;
  } catch (error) {
    stages.push({
      durationMs: Math.round(performance.now() - startedAt),
      id,
      inputSummary,
      label,
      model,
      outputSummary: error instanceof Error ? error.message : 'Failed',
      provider,
      status: 'error',
    });
    throw error;
  }
}

function getValseaApiKey(request: NextRequest) {
  return (
    request.headers.get('x-valsea-api-key')?.trim() ||
    process.env.VALSEA_API_KEY?.trim()
  );
}

async function verifyValseaWorkspaceAccess(
  context: AuthorizedRequest,
  wsId: string
) {
  const access = await checkEducationWorkspaceAccess({ context, wsId });
  return access.ok ? null : access.response;
}

async function readJsonResponse(response: Response) {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text) as ValseaRecord;
  } catch {
    return { message: text };
  }
}

class ValseaRequestError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

async function postValseaJson(
  request: NextRequest,
  path: string,
  payload: ValseaRecord
) {
  const apiKey = getValseaApiKey(request);
  if (!apiKey) {
    throw new ValseaRequestError(
      'Provide a Valsea API key or configure VALSEA_API_KEY',
      503
    );
  }

  const response = await fetch(`${VALSEA_BASE_URL}${path}`, {
    body: JSON.stringify(payload),
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });

  const data = await readJsonResponse(response);
  if (!response.ok) {
    throw new ValseaRequestError(
      getString(data, 'message') ||
        getString(data, 'error') ||
        `Valsea request failed with ${response.status}`,
      response.status
    );
  }

  return data;
}

async function transcribeAudio(
  request: NextRequest,
  file: File,
  language: string
) {
  const apiKey = getValseaApiKey(request);
  if (!apiKey) {
    throw new ValseaRequestError(
      'Provide a Valsea API key or configure VALSEA_API_KEY',
      503
    );
  }

  const formData = new FormData();
  formData.set('file', file, file.name);
  formData.set('model', 'valsea-transcribe');
  formData.set('language', language === 'auto' ? 'english' : language);
  formData.set('response_format', 'verbose_json');
  formData.set('enable_correction', 'true');
  formData.set('enable_tags', 'true');

  const response = await fetch(`${VALSEA_BASE_URL}/audio/transcriptions`, {
    body: formData,
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    method: 'POST',
  });

  const data = await readJsonResponse(response);
  if (!response.ok) {
    throw new ValseaRequestError(
      getString(data, 'message') ||
        getString(data, 'error') ||
        `Valsea transcription failed with ${response.status}`,
      response.status
    );
  }

  return data;
}

async function readDriveAudioFile({
  audioFileName,
  audioStoragePath,
  wsId,
}: {
  audioFileName?: string;
  audioStoragePath: string;
  wsId: string;
}) {
  const sanitizedPath = sanitizePath(audioStoragePath);
  if (!sanitizedPath || !isValseaAudioStoragePath(sanitizedPath)) {
    throw new ValseaRequestError('Invalid Valsea audio storage path', 400);
  }

  const resolvedWsId = resolveWorkspaceId(wsId);
  const finalizedValidation = await validateFinalizedValseaAudioUpload({
    path: sanitizedPath,
    wsId: resolvedWsId,
  });
  if (!finalizedValidation.ok) {
    throw new ValseaRequestError(
      finalizedValidation.message,
      finalizedValidation.status
    );
  }

  const signedUrl = await createWorkspaceStorageSignedReadUrl(
    resolvedWsId,
    sanitizedPath,
    { expiresIn: 5 * 60 }
  );
  const response = await fetch(signedUrl, { cache: 'no-store' });
  if (!response.ok) {
    throw new ValseaRequestError('Could not read stored classroom audio', 404);
  }

  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > MAX_VALSEA_AUDIO_UPLOAD_BYTES) {
    throw new ValseaRequestError('Audio file must be 10 MB or smaller', 413);
  }

  const fallbackName =
    sanitizedPath.split('/').at(-1) || 'classroom-audio.webm';
  return new File([buffer], audioFileName || fallbackName, {
    type: response.headers.get('content-type') || 'application/octet-stream',
  });
}

async function generateMiraSentimentLayer({
  context,
  isMiraAllowed,
  sourceText,
  stages,
  wsId,
}: {
  context: AuthorizedRequest;
  isMiraAllowed: boolean;
  sourceText: string;
  stages: ObservabilityStage[];
  wsId: string;
}) {
  const startedAt = performance.now();
  const resolvedWsId = resolveWorkspaceId(wsId);

  if (!isMiraAllowed) {
    stages.push({
      durationMs: Math.round(performance.now() - startedAt),
      id: 'mira-sentiment',
      inputSummary: summarizeText(sourceText),
      label: 'Mira sentiment lab',
      outputSummary: 'Mira is limited to @tuturuuu.com accounts',
      provider: 'mira',
      status: 'skipped',
    });
    return null;
  }

  try {
    const resolvedModel = await resolvePlanModel({
      capability: 'language',
      wsId: resolvedWsId,
    });
    const modelId = resolvedModel.modelId;
    const creditCheck = await checkAiCredits(
      resolvedWsId,
      modelId,
      'generate',
      { userId: context.user.id }
    );

    if (!creditCheck.allowed) {
      stages.push({
        durationMs: Math.round(performance.now() - startedAt),
        id: 'mira-sentiment',
        inputSummary: summarizeText(sourceText),
        label: 'Mira sentiment lab',
        model: modelId,
        outputSummary: creditCheck.errorMessage || 'AI credits unavailable',
        provider: 'mira',
        status: 'skipped',
      });
      return null;
    }

    const { object, usage } = await generateObject({
      model: await withAiMemory({
        customId: `valsea-sentiment-${Date.now()}`,
        model: google(toBareModelName(modelId)),
        product: 'education',
        source: 'valsea_sentiment',
        surface: 'valsea_sentiment',
        userId: context.user.id,
        wsId: resolvedWsId,
      }),
      schema: MiraSentimentSchema,
      prompt: `Analyze this classroom speech transcript for a teacher and a researcher.

Transcript:
"""
${sourceText}
"""

Return observable sentiment dimensions, short evidence spans copied from the transcript, an intent label, a risk label, one parent-safe summary, and one next teacher move.`,
      system:
        'You are Mira, Tuturuuu’s internal education assistant. Analyze learner sentiment with classroom usefulness and research observability. Do not diagnose mental health.',
    });

    deductAiCredits({
      wsId: resolvedWsId,
      userId: context.user.id,
      modelId,
      inputTokens: usage.inputTokens ?? 0,
      outputTokens: usage.outputTokens ?? 0,
      reasoningTokens: usage.outputTokenDetails?.reasoningTokens ?? 0,
      feature: 'generate',
    }).catch((error: unknown) =>
      console.warn('Failed to deduct Valsea sentiment credits', error)
    );

    stages.push({
      durationMs: Math.round(performance.now() - startedAt),
      id: 'mira-sentiment',
      inputSummary: summarizeText(sourceText),
      label: 'Mira sentiment lab',
      model: modelId,
      outputSummary: `${object.sentiment} / ${object.intent}`,
      provider: 'mira',
      raw: object,
      status: 'success',
    });

    return object;
  } catch (error) {
    stages.push({
      durationMs: Math.round(performance.now() - startedAt),
      id: 'mira-sentiment',
      inputSummary: summarizeText(sourceText),
      label: 'Mira sentiment lab',
      outputSummary:
        error instanceof PlanModelResolutionError
          ? error.message
          : 'Mira sentiment layer unavailable',
      provider: 'mira',
      status: 'skipped',
    });
    console.warn('Mira sentiment layer unavailable', error);
    return null;
  }
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

async function parsePayload(request: NextRequest): Promise<ParsePayloadResult> {
  const contentType = request.headers.get('content-type') ?? '';

  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData();
    const file = formData.get('file');
    const parsed = classroomSchema.safeParse({
      language: formData.get('language') || undefined,
      audioFileName: formData.get('audioFileName') || undefined,
      audioStoragePath: formData.get('audioStoragePath') || undefined,
      outputType: formData.get('outputType') || undefined,
      pronunciationModel: formData.get('pronunciationModel') || undefined,
      targetLanguage: formData.get('targetLanguage') || undefined,
      transcript: formData.get('transcript') || undefined,
    });

    if (!parsed.success) {
      return {
        error: NextResponse.json(
          { message: 'Invalid classroom payload' },
          { status: 400 }
        ),
      };
    }

    return {
      data: {
        ...parsed.data,
        file: file instanceof File && file.size > 0 ? file : undefined,
      },
    };
  }

  const parsed = classroomSchema.safeParse(await request.json());
  if (!parsed.success) {
    return {
      error: NextResponse.json(
        { message: 'Invalid classroom payload' },
        { status: 400 }
      ),
    };
  }

  return { data: { ...parsed.data, file: undefined } };
}

export const GET = withSessionAuth<Params>(
  async (_request, context, { wsId }) => {
    const accessError = await verifyValseaWorkspaceAccess(context, wsId);
    if (accessError) return accessError;

    return NextResponse.json(
      {
        hasServerKey: Boolean(process.env.VALSEA_API_KEY?.trim()),
        pronunciationDefaultModel: DEFAULT_PRONUNCIATION_MODEL,
        pronunciationModels: PRONUNCIATION_MODELS,
      },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  },
  { rateLimitKind: 'read' }
);

export const POST = withSessionAuth<Params>(
  async (request, context, { wsId }) => {
    try {
      const accessError = await verifyValseaWorkspaceAccess(context, wsId);
      if (accessError) return accessError;

      const parsed = await parsePayload(request);
      if (parsed.error) return parsed.error;

      const {
        audioFileName,
        audioStoragePath,
        language,
        outputType,
        pronunciationModel,
        targetLanguage,
      } = parsed.data;
      const stages: ObservabilityStage[] = [];
      const driveFile = audioStoragePath
        ? await runObservedStage({
            id: 'drive-audio',
            inputSummary: audioStoragePath,
            label: 'Drive audio fetch',
            operation: () =>
              readDriveAudioFile({
                audioFileName,
                audioStoragePath,
                wsId,
              }),
            outputSummary: (result) =>
              `${result.name} / ${Math.round(result.size / 1024)} KB`,
            provider: 'tuturuuu-drive',
            stages,
          })
        : undefined;
      const file = parsed.data.file ?? driveFile;

      if (file && file.size > MAX_VALSEA_AUDIO_UPLOAD_BYTES) {
        return NextResponse.json(
          { message: 'Audio file must be 10 MB or smaller' },
          { status: 413 }
        );
      }

      const transcription = file
        ? await runObservedStage({
            id: 'valsea-transcription',
            inputSummary: `${file.name} / ${Math.round(file.size / 1024)} KB`,
            label: 'Valsea transcription',
            model: 'valsea-transcribe',
            operation: () => transcribeAudio(request, file, language),
            outputSummary: (result) =>
              summarizeText(
                getString(result, 'raw_transcript') || getString(result, 'text')
              ),
            provider: 'valsea',
            stages,
          })
        : null;
      if (!file) {
        stages.push({
          id: 'valsea-transcription',
          inputSummary: summarizeText(parsed.data.transcript),
          label: 'Valsea transcription',
          outputSummary: 'Text-only run',
          provider: 'valsea',
          status: 'skipped',
        });
      }
      const spokenTranscript =
        getString(transcription ?? undefined, 'raw_transcript') ||
        getString(transcription ?? undefined, 'text');
      const referenceTranscript = parsed.data.transcript;
      const transcript = spokenTranscript || referenceTranscript;

      if (!transcript) {
        return NextResponse.json(
          { message: 'Transcript text or an audio file is required' },
          { status: 400 }
        );
      }

      const languageHint = language === 'auto' ? undefined : language;
      const [clarification, annotations] = await Promise.all([
        runObservedStage({
          id: 'valsea-clarification',
          inputSummary: summarizeText(transcript),
          label: 'Valsea clarification',
          model: 'valsea-clarify',
          operation: () =>
            postValseaJson(request, '/clarifications', {
              language: languageHint,
              model: 'valsea-clarify',
              response_format: 'verbose_json',
              text: transcript,
            }),
          outputSummary: (result) =>
            summarizeText(getString(result, 'clarified_text')),
          provider: 'valsea',
          stages,
        }),
        runObservedStage({
          id: 'valsea-annotations',
          inputSummary: summarizeText(transcript),
          label: 'Valsea annotations',
          model: 'valsea-annotate',
          operation: () =>
            postValseaJson(request, '/annotations', {
              enable_correction: true,
              enable_tags: true,
              language: languageHint,
              model: 'valsea-annotate',
              response_format: 'verbose_json',
              text: transcript,
            }),
          outputSummary: (result) =>
            `${getSemanticTags(result).length} semantic cues`,
          provider: 'valsea',
          stages,
        }),
      ]);

      const clarifiedText =
        getString(clarification, 'clarified_text') || transcript;
      const semanticTags = [
        ...getSemanticTags(transcription ?? undefined),
        ...getSemanticTags(annotations),
      ];

      const [translation, formatting, sentiment] = await Promise.all([
        runObservedStage({
          id: 'valsea-translation',
          inputSummary: summarizeText(clarifiedText),
          label: 'Valsea translation',
          model: 'valsea-translate',
          operation: () =>
            postValseaJson(request, '/translations', {
              model: 'valsea-translate',
              response_format: 'verbose_json',
              source: 'auto',
              target: targetLanguage,
              text: clarifiedText,
            }),
          outputSummary: (result) =>
            summarizeText(getString(result, 'translated_text')),
          provider: 'valsea',
          stages,
        }),
        runObservedStage({
          id: 'valsea-artifact',
          inputSummary: `${outputType} / ${semanticTags.length} cues`,
          label: 'Valsea artifact',
          model: 'valsea-format',
          operation: () =>
            postValseaJson(request, '/formatting', {
              model: 'valsea-format',
              output_type: outputType,
              response_format: 'verbose_json',
              semantic_tags: semanticTags,
              transcript: clarifiedText,
            }),
          outputSummary: (result) =>
            summarizeText(parseValseaTextOutput(result)),
          provider: 'valsea',
          stages,
        }),
        runObservedStage({
          id: 'valsea-sentiment',
          inputSummary: summarizeText(clarifiedText),
          label: 'Valsea sentiment',
          model: 'valsea-sentiment',
          operation: () =>
            postValseaJson(request, '/sentiment', {
              model: 'valsea-sentiment',
              response_format: 'verbose_json',
              semantic_tags: semanticTags,
              transcript: clarifiedText,
            }),
          outputSummary: (result) =>
            [getString(result, 'sentiment'), getNumber(result, 'confidence')]
              .filter(Boolean)
              .join(' / '),
          provider: 'valsea',
          stages,
        }),
      ]);
      const miraSentiment = await generateMiraSentimentLayer({
        context,
        isMiraAllowed: await isInternalMiraUser(context),
        sourceText: clarifiedText,
        stages,
        wsId,
      });
      const pronunciation =
        file && referenceTranscript
          ? await runObservedStage({
              id: 'local-pronunciation',
              inputSummary: summarizeText(referenceTranscript),
              label: 'Local pronunciation',
              model: pronunciationModel,
              operation: () =>
                gradeVoicePronunciation({
                  assessorModel: pronunciationModel,
                  file,
                  language,
                  referenceText: referenceTranscript,
                  transcription,
                }),
              outputSummary: (result) =>
                result.status === 'graded'
                  ? `${result.overallScore}% / ${result.nativeSimilarity}% native-like`
                  : result.status,
              provider: 'local-model',
              stages,
            })
          : null;
      if (!pronunciation) {
        stages.push({
          id: 'local-pronunciation',
          inputSummary: summarizeText(referenceTranscript),
          label: 'Local pronunciation',
          outputSummary: file ? 'No reference phrase' : 'No audio',
          provider: 'local-model',
          status: 'skipped',
        });
      }

      return NextResponse.json({
        annotations: {
          accentCorrections:
            annotations.accent_corrections ?? transcription?.corrections ?? [],
          annotatedText:
            getString(annotations, 'annotated_text') ||
            getString(transcription ?? undefined, 'annotated_text'),
          raw: annotations,
          semanticTags,
        },
        artifact: {
          output: parseValseaTextOutput(formatting),
          outputType,
          raw: formatting,
        },
        clarification: {
          explanations: clarification.explanations ?? [],
          raw: clarification,
          text: clarifiedText,
        },
        pronunciation,
        sentiment: {
          confidence: getNumber(sentiment, 'confidence'),
          consensus: getSentimentConsensus({
            mira: miraSentiment,
            valsea: sentiment,
          }),
          emotions: getStringArray(sentiment, 'emotions'),
          layers: {
            mira: miraSentiment
              ? {
                  ...miraSentiment,
                  provider: 'mira',
                  raw: miraSentiment,
                }
              : undefined,
            valsea: getValseaSentimentLayer(sentiment),
          },
          raw: sentiment,
          reasoning: getString(sentiment, 'reasoning'),
          sentiment: getString(sentiment, 'sentiment'),
        },
        observability: {
          stages,
        },
        source: {
          audioStoragePath,
          detectedLanguages:
            transcription?.detected_languages ??
            translation.source_language ??
            [],
          referenceTranscript,
          rawTranscript:
            getString(transcription ?? undefined, 'raw_transcript') ||
            transcript,
          spokenTranscript,
          transcript,
        },
        translation: {
          raw: translation,
          sourceLanguage: getString(translation, 'source_language'),
          targetLanguage:
            getString(translation, 'target_language') || targetLanguage,
          text: getString(translation, 'translated_text') || '',
        },
      });
    } catch (error) {
      if (error instanceof ValseaRequestError) {
        return NextResponse.json(
          { message: error.message },
          { status: error.status }
        );
      }

      console.error('Failed to generate Valsea classroom artifact:', error);
      return NextResponse.json(
        { message: 'Failed to generate classroom artifact' },
        { status: 500 }
      );
    }
  },
  {
    maxPayloadSize: MAX_VALSEA_AUDIO_UPLOAD_BYTES + 512 * 1024,
    rateLimit: { maxRequests: 10, windowMs: 60_000 },
  }
);
