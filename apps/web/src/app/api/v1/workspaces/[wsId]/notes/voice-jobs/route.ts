import {
  enforceAiDataConsent,
  hasAiDataConsent,
  requiresAiDataConsent,
} from '@tuturuuu/ai/chat/ai-data-consent';
import { after, connection, NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';
import { notesVoiceWorkspace } from '@/lib/notes-voice/access';
import { assertNotesVoiceAiEnabled } from '@/lib/notes-voice/ai-gate';
import {
  notesVoiceInputHash,
  validateNotesVoiceAudio,
} from '@/lib/notes-voice/audio';
import {
  publicVoiceJob,
  reserveVoiceJob,
  runVoiceJob,
} from '@/lib/notes-voice/jobs';
import {
  readVoiceForm,
  VOICE_REQUEST_LIMIT,
  voiceErrorResponse,
} from '@/lib/notes-voice/request';
import { NotesVoiceError, voiceRequestSchema } from '@/lib/notes-voice/schema';
export const maxDuration = 180;
export const POST = withSessionAuth<{ wsId: string }>(
  async (request, auth, params) => {
    await connection();
    try {
      const wsId = await notesVoiceWorkspace(
        auth.supabase,
        auth.user,
        params.wsId
      );
      assertNotesVoiceAiEnabled(wsId);
      // The recording is transcribed by Gemini after the response is sent, so
      // a native caller's consent is checked here and again at admission.
      const consentRefusal = await enforceAiDataConsent(request, auth.user.id);
      if (consentRefusal) return consentRefusal;
      const consentRequired = requiresAiDataConsent(request);
      const form = await readVoiceForm(request);
      const parsed = voiceRequestSchema.safeParse({
        requestId: form.get('requestId'),
        timezone: form.get('timezone'),
        expectedRevision: form.has('expectedRevision')
          ? form.get('expectedRevision')
          : undefined,
      });
      if (!parsed.success)
        throw new NotesVoiceError(400, 'invalid_voice_request');
      const file = form.get('audio');
      if (!(file instanceof File))
        throw new NotesVoiceError(400, 'missing_audio');
      const audio = new Uint8Array(await file.arrayBuffer());
      validateNotesVoiceAudio(audio);
      const owner = { userId: auth.user.id, wsId };
      const reservation = await reserveVoiceJob(
        owner,
        parsed.data,
        notesVoiceInputHash(audio, parsed.data.timezone)
      );
      if (reservation.start)
        after(() =>
          runVoiceJob(owner, reservation.job, audio, async (phase) => {
            await notesVoiceWorkspace(auth.supabase, auth.user, wsId);
            if (phase !== 'provider_admission') return;
            assertNotesVoiceAiEnabled(wsId);
            if (consentRequired && !(await hasAiDataConsent(auth.user.id)))
              throw new NotesVoiceError(403, 'ai_consent_required');
          })
        );
      return NextResponse.json(publicVoiceJob(reservation.job), {
        status: reservation.job.status === 'completed' ? 200 : 202,
        headers: { 'Cache-Control': 'private, no-store' },
      });
    } catch (error) {
      return voiceErrorResponse(error);
    }
  },
  {
    allowAppSessionAuth: true,
    maxPayloadSize: VOICE_REQUEST_LIMIT,
    rateLimit: { windowMs: 60000, maxRequests: 8 },
  }
);
