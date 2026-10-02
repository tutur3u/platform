import { createProgrammingRepository } from '@tuturuuu/education-core/education/programming-repository';
import {
  editProgrammingProblem,
  getProgrammingProblem,
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

type Params = { wsId: string; problemId: string };
export const GET = withSessionAuth<Params>(async (request, context, params) => {
  await connection();
  const parsed = ProgrammingRouteParams.required({ problemId: true }).safeParse(
    await params
  );
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
      problem: await getProgrammingProblem(
        repository,
        access,
        parsed.data.problemId
      ),
    });
  } catch (error) {
    return programmingErrorResponse(error);
  }
}, PROGRAMMING_SESSION_AUTH);

export const PATCH = withSessionAuth<Params>(
  async (request, context, params) => {
    const parsed = ProgrammingRouteParams.required({
      problemId: true,
    }).safeParse(await params);
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
        await editProgrammingProblem(
          repository,
          access,
          parsed.data.problemId,
          await programmingJson(request)
        )
      );
    } catch (error) {
      return programmingErrorResponse(error);
    }
  },
  PROGRAMMING_SESSION_AUTH
);
