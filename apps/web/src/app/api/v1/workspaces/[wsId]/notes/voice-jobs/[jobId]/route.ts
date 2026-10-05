import { connection, NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import { notesVoiceWorkspace } from '@/lib/notes-voice/access';
import {
  deleteVoiceJob,
  getVoiceJob,
  publicVoiceJob,
} from '@/lib/notes-voice/jobs';
import { voiceErrorResponse } from '@/lib/notes-voice/request';
import { NotesVoiceError } from '@/lib/notes-voice/schema';

type Params = { wsId: string; jobId: string };
export const GET = withSessionAuth<Params>(
  async (_request, auth, params) => {
    await connection();
    try {
      if (!z.uuid().safeParse(params.jobId).success)
        throw new NotesVoiceError(400, 'invalid_job');
      const wsId = await notesVoiceWorkspace(
        auth.supabase,
        auth.user,
        params.wsId
      );
      return NextResponse.json(
        publicVoiceJob(
          await getVoiceJob({ userId: auth.user.id, wsId }, params.jobId)
        ),
        { headers: { 'Cache-Control': 'private, no-store' } }
      );
    } catch (error) {
      return voiceErrorResponse(error);
    }
  },
  { allowAppSessionAuth: true }
);
export const DELETE = withSessionAuth<Params>(
  async (_request, auth, params) => {
    try {
      if (!z.uuid().safeParse(params.jobId).success)
        throw new NotesVoiceError(400, 'invalid_job');
      const wsId = await notesVoiceWorkspace(
        auth.supabase,
        auth.user,
        params.wsId
      );
      await deleteVoiceJob({ userId: auth.user.id, wsId }, params.jobId);
      return NextResponse.json({ deleted: true });
    } catch (error) {
      return voiceErrorResponse(error);
    }
  },
  { allowAppSessionAuth: true }
);
