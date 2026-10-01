import {
  checkProgrammingAuthorAccess,
  resolveProgrammingLearnerAccess,
} from '@tuturuuu/education-core/education/programming-access';
import { ProgrammingError } from '@tuturuuu/education-core/education/programming-model';
import type { ProgrammingAccess } from '@tuturuuu/education-core/education/programming-service';
import { TulearnAccessError } from '@tuturuuu/education-core/tulearn/access';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { SessionAuthContext } from './api-auth';

export const PROGRAMMING_SESSION_AUTH = {
  allowAppSessionAuth: { targetApp: ['learn', 'teach'] as const },
};
export const ProgrammingRouteParams = z.object({
  wsId: z.string().min(1).max(80),
  problemId: z.guid().optional(),
});
const querySchema = z.object({
  mode: z.enum(['learner', 'author']).default('learner'),
  studentId: z.guid().optional(),
});

export function programmingResponse(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
      Vary: 'Cookie, Authorization',
    },
  });
}
export function programmingErrorResponse(error: unknown) {
  if (
    error instanceof ProgrammingError ||
    error instanceof TulearnAccessError
  ) {
    return programmingResponse({ message: error.message }, error.status);
  }
  return programmingResponse({ message: 'Programming request failed' }, 500);
}

export async function authorizeProgrammingRequest(
  context: SessionAuthContext,
  wsId: string,
  url: string,
  authorOnly = false
): Promise<ProgrammingAccess | NextResponse> {
  const search = new URL(url).searchParams;
  const parsed = querySchema.safeParse({
    mode: authorOnly ? 'author' : (search.get('mode') ?? undefined),
    studentId: search.get('studentId') ?? undefined,
  });
  if (!parsed.success)
    return programmingResponse({ message: 'Invalid programming query' }, 400);
  if (parsed.data.mode === 'author') {
    if (parsed.data.studentId)
      return programmingResponse(
        { message: 'Author requests cannot select a learner' },
        400
      );
    const access = await checkProgrammingAuthorAccess({ context, wsId });
    if (!access.ok) {
      access.response.headers.set('Cache-Control', 'private, no-store');
      return access.response;
    }
    return {
      wsId: access.normalizedWsId,
      actorId: context.user.id,
      mode: 'author',
    };
  }
  const subject = await resolveProgrammingLearnerAccess({
    context,
    wsId,
    studentId: parsed.data.studentId,
  });
  return { wsId: subject.wsId, actorId: context.user.id, mode: 'learner' };
}

export async function programmingJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ProgrammingError('Invalid JSON payload', 400);
  }
}
