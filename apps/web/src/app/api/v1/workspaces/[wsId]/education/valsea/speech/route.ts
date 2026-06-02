import { randomUUID } from 'node:crypto';
import { resolveWorkspaceId } from '@tuturuuu/utils/constants';
import { sanitizeFilename } from '@tuturuuu/utils/storage-path';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { type AuthorizedRequest, withSessionAuth } from '@/lib/api-auth';
import { checkEducationWorkspaceAccess } from '@/lib/education/access';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import {
  uploadWorkspaceStorageFileDirect,
  WorkspaceStorageError,
} from '@/lib/workspace-storage-provider';

type Params = {
  wsId: string;
};

type LocalSpeechResponse = {
  audioBase64?: string;
  contentType?: string;
  detail?: string;
  durationMs?: number;
  engine?: 'piper';
  message?: string;
  model?: string;
  trace?: unknown;
  voiceId?: string;
};

const MAX_TTS_TEXT_LENGTH = 700;
const VALSEA_AUDIO_DRIVE_PATH = 'education/valsea/audio';
const speechSchema = z.object({
  language: z.string().trim().min(2).max(64),
  pace: z.number().min(0.6).max(1.4).default(1),
  speakerId: z.number().int().min(0).max(999).optional(),
  text: z.string().trim().min(1).max(MAX_TTS_TEXT_LENGTH),
  voiceId: z.string().trim().min(2).max(120),
});

async function verifyAccess(context: AuthorizedRequest, wsId: string) {
  const access = await checkEducationWorkspaceAccess({ context, wsId });
  return access.ok ? null : access.response;
}

function getVoiceLabBaseUrl() {
  const explicit = process.env.VALSEA_VOICE_LAB_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, '');

  const assessorUrl = process.env.VALSEA_PRONUNCIATION_ASSESSOR_URL?.trim();
  if (assessorUrl) return assessorUrl.replace(/\/assess\/?$/, '');

  return 'http://pronunciation-assessor:8010';
}

function toDataUrl(contentType: string, buffer: Uint8Array) {
  return `data:${contentType};base64,${Buffer.from(buffer).toString('base64')}`;
}

export const POST = withSessionAuth<Params>(
  async (request, context, { wsId }) => {
    const startedAt = performance.now();

    try {
      const accessError = await verifyAccess(context, wsId);
      if (accessError) return accessError;

      const parsed = speechSchema.safeParse(
        await request.json().catch(() => null)
      );
      if (!parsed.success) {
        return NextResponse.json(
          { message: 'Invalid speech synthesis payload' },
          { status: 400 }
        );
      }

      const endpoint = `${getVoiceLabBaseUrl()}/tts/synthesize`;
      const response = await fetch(endpoint, {
        body: JSON.stringify(parsed.data),
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });

      const data = (await response
        .json()
        .catch(() => ({}))) as LocalSpeechResponse;
      if (!response.ok || !data.audioBase64) {
        serverLogger.error('Local speech synthesis upstream failed', {
          hasPublicDetail: Boolean(data.detail || data.message),
          status: response.status,
        });
        return NextResponse.json(
          { message: 'Local speech synthesis failed' },
          { status: response.ok ? 502 : response.status }
        );
      }

      const contentType = data.contentType || 'audio/wav';
      const buffer = Buffer.from(data.audioBase64, 'base64');
      if (buffer.byteLength === 0) {
        return NextResponse.json(
          { message: 'Local speech synthesis returned empty audio' },
          { status: 502 }
        );
      }

      const baseName = sanitizeFilename(
        `mira-${parsed.data.voiceId}-${Date.now()}-${randomUUID()}.wav`
      );
      const audioFileName = baseName || `mira-voice-${randomUUID()}.wav`;
      const resolvedWsId = resolveWorkspaceId(wsId);
      const upload = await uploadWorkspaceStorageFileDirect(
        resolvedWsId,
        `${VALSEA_AUDIO_DRIVE_PATH}/${audioFileName}`,
        buffer,
        {
          contentType,
          upsert: false,
        }
      );

      return NextResponse.json({
        audioFileName,
        audioStoragePath: upload.path,
        contentType,
        engine: 'piper',
        fileSize: buffer.byteLength,
        previewDataUrl: toDataUrl(contentType, buffer),
        trace: {
          durationMs: Math.round(performance.now() - startedAt),
          engine: 'piper',
          model: data.model,
          provider: 'local-model',
          voiceId: data.voiceId || parsed.data.voiceId,
        },
        voiceId: data.voiceId || parsed.data.voiceId,
      });
    } catch (error) {
      if (error instanceof WorkspaceStorageError) {
        return NextResponse.json(
          { message: error.message },
          { status: error.status }
        );
      }

      serverLogger.error('Failed to synthesize Valsea speech:', error);
      return NextResponse.json(
        { message: 'Failed to synthesize classroom speech' },
        { status: 500 }
      );
    }
  },
  { rateLimit: { maxRequests: 20, windowMs: 60_000 } }
);
