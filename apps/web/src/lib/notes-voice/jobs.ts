import 'server-only';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { Json, Tables } from '@tuturuuu/types';
import { generateBilledNotesVoice } from './provider';
import { NotesVoiceError } from './schema';
export type VoiceJob = Tables<{ schema: 'private' }, 'note_voice_jobs'>;
export type VoiceOwner = { userId: string; wsId: string };
async function database() {
  return (await createAdminClient({ noCookie: true })).schema('private');
}
export async function getVoiceJob(owner: VoiceOwner, id: string) {
  const db = await database();
  const { data, error } = await db
    .from('note_voice_jobs')
    .select('*')
    .eq('id', id)
    .eq('user_id', owner.userId)
    .eq('ws_id', owner.wsId)
    .maybeSingle();
  if (error) throw new NotesVoiceError(503, 'jobs_unavailable');
  if (!data) throw new NotesVoiceError(404, 'job_not_found');
  // A terminated server must never silently repeat an uncertain paid provider request.
  if (
    ['pending', 'transcribing', 'summarizing'].includes(data.status) &&
    Date.now() - Date.parse(data.updated_at) > 210_000
  )
    return updateVoiceJob(owner, data, {
      status: 'review_required',
      error_code: 'interrupted_review_required',
    });
  return data;
}
export async function updateVoiceJob(
  owner: VoiceOwner,
  job: VoiceJob,
  patch: Partial<VoiceJob>
) {
  const db = await database();
  const { data, error } = await db
    .from('note_voice_jobs')
    .update({
      ...patch,
      revision: job.revision + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', job.id)
    .eq('ws_id', owner.wsId)
    .eq('user_id', owner.userId)
    .eq('revision', job.revision)
    .select('*')
    .maybeSingle();
  if (error) throw new NotesVoiceError(503, 'jobs_unavailable');
  if (!data) throw new NotesVoiceError(409, 'job_revision_conflict');
  return data;
}
export async function reserveVoiceJob(
  owner: VoiceOwner,
  request: { requestId: string; timezone: string; expectedRevision?: number },
  inputHash: string
) {
  const db = await database();
  const { data, error } = await db
    .from('note_voice_jobs')
    .insert({
      id: request.requestId,
      ws_id: owner.wsId,
      user_id: owner.userId,
      input_hash: inputHash,
      timezone: request.timezone,
    })
    .select('*')
    .maybeSingle();
  if (!error && data) return { job: data, start: true };
  if (error?.code !== '23505')
    throw new NotesVoiceError(503, 'jobs_unavailable');
  const job = await getVoiceJob(owner, request.requestId);
  if (job.input_hash !== inputHash)
    throw new NotesVoiceError(409, 'request_payload_conflict');
  if (job.status === 'failed') {
    if (request.expectedRevision !== job.revision)
      throw new NotesVoiceError(409, 'retry_revision_required');
    return {
      job: await updateVoiceJob(owner, job, {
        status: 'pending',
        attempt: job.attempt + 1,
        error_code: null,
      }),
      start: true,
    };
  }
  return { job, start: job.status === 'pending' };
}
export function publicVoiceJob(job: VoiceJob) {
  return {
    id: job.id,
    wsId: job.ws_id,
    status: job.status,
    revision: job.revision,
    transcript: job.transcript,
    artifact: job.artifact,
    errorCode: job.error_code,
    createdAt: job.created_at,
    updatedAt: job.updated_at,
  };
}
export async function runVoiceJob(
  owner: VoiceOwner,
  pending: VoiceJob,
  audio: Uint8Array,
  verifyAccess: () => Promise<unknown>
) {
  let job = pending;
  try {
    // Compare-and-set means repeated scheduling cannot execute a provider twice.
    job = await updateVoiceJob(owner, job, {
      status: job.transcript === null ? 'transcribing' : 'summarizing',
    });
  } catch {
    return;
  }
  try {
    await verifyAccess();
    if (job.transcript === null) {
      const generated = await generateBilledNotesVoice(
        { audio, mediaType: 'audio/wav' },
        { ...owner, jobId: job.id, attempt: job.attempt }
      );
      job = await updateVoiceJob(owner, job, {
        transcript: generated.transcript ?? '',
        status: 'summarizing',
      });
    }
    await verifyAccess();
    if (!job.transcript?.trim()) {
      await updateVoiceJob(owner, job, {
        status: 'completed',
        artifact: {
          title: '',
          summary: '',
          decisions: [],
          actionItems: [],
          recommendations: [],
          openQuestions: [],
        },
      });
      return;
    }
    const generated = await generateBilledNotesVoice(
      {
        transcript: job.transcript!,
        timezone: job.timezone,
        recordedAt: job.created_at,
      },
      { ...owner, jobId: job.id, attempt: job.attempt }
    );
    await verifyAccess();
    await updateVoiceJob(owner, job, {
      status: 'completed',
      artifact: generated.artifact as Json,
    });
  } catch (error) {
    const safePreflight =
      error instanceof NotesVoiceError &&
      [
        'provider_unconfigured',
        'billing_workspace_unavailable',
        'credits_unavailable',
        'pricing_unavailable',
        'workspace_denied',
        'membership_unavailable',
      ].includes(error.code);
    try {
      await updateVoiceJob(owner, job, {
        status: safePreflight ? 'failed' : 'review_required',
        error_code: safePreflight ? error.code : 'processing_review_required',
      });
    } catch {
      console.error('Notes voice job final status could not be persisted');
    }
  }
}
export async function deleteVoiceJob(owner: VoiceOwner, id: string) {
  const job = await getVoiceJob(owner, id);
  if (['pending', 'transcribing', 'summarizing'].includes(job.status))
    throw new NotesVoiceError(409, 'job_still_processing');
  const db = await database();
  const { data, error } = await db
    .from('note_voice_jobs')
    .delete()
    .eq('id', id)
    .eq('ws_id', owner.wsId)
    .eq('user_id', owner.userId)
    .eq('revision', job.revision)
    .select('id')
    .maybeSingle();
  if (error) throw new NotesVoiceError(503, 'jobs_unavailable');
  if (!data) throw new NotesVoiceError(409, 'job_revision_conflict');
}
