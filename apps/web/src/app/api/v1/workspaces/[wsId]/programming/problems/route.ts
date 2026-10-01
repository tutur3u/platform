import { createProgrammingRepository } from '@tuturuuu/education-core/education/programming-repository';
import {
  createProgrammingProblem,
  listProgrammingProblems,
} from '@tuturuuu/education-core/education/programming-service';
import { connection, NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';
import {
  authorizeProgrammingRequest,
  PROGRAMMING_SESSION_AUTH,
  ProgrammingRouteParams,
  programmingErrorResponse,
  programmingJson,
  programmingResponse,
} from '@/lib/programming-api';

type Params = { wsId: string };
export const GET = withSessionAuth<Params>(async (request, context, params) => {
  await connection();
  const parsed = ProgrammingRouteParams.safeParse(await params);
  if (!parsed.success)
    return programmingResponse({ message: 'Invalid route params' }, 400);
  try {
    const access = await authorizeProgrammingRequest(
      context,
      parsed.data.wsId,
      request.url
    );
    if (access instanceof NextResponse) return access;
    const repository = await createProgrammingRepository();
    return programmingResponse({
      problems: await listProgrammingProblems(repository, access),
    });
  } catch (error) {
    return programmingErrorResponse(error);
  }
}, PROGRAMMING_SESSION_AUTH);

export const POST = withSessionAuth<Params>(
  async (request, context, params) => {
    const parsed = ProgrammingRouteParams.safeParse(await params);
    if (!parsed.success)
      return programmingResponse({ message: 'Invalid route params' }, 400);
    try {
      const access = await authorizeProgrammingRequest(
        context,
        parsed.data.wsId,
        request.url,
        true
      );
      if (access instanceof NextResponse) return access;
      const repository = await createProgrammingRepository();
      return programmingResponse(
        await createProgrammingProblem(
          repository,
          access,
          await programmingJson(request)
        ),
        201
      );
    } catch (error) {
      return programmingErrorResponse(error);
    }
  },
  PROGRAMMING_SESSION_AUTH
);
