import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import { requireQuizModuleAccess } from '@/lib/quiz-module-access';

const ParamsSchema = z.object({ wsId: z.string().min(1), setId: z.guid() });
const LinkModulesSchema = z.object({
  moduleIds: z.array(z.guid()).min(1).max(500),
});
type Params = { wsId: string; setId: string };

export const POST = withSessionAuth(
  async (request, context, params: Params | Promise<Params>) => {
    const parsedParams = ParamsSchema.safeParse(await params);
    if (!parsedParams.success) {
      return NextResponse.json(
        { message: 'Invalid route params' },
        { status: 400 }
      );
    }
    const parsedBody = LinkModulesSchema.safeParse(
      await request.json().catch(() => null)
    );
    if (!parsedBody.success) {
      return NextResponse.json(
        { message: 'Invalid request body' },
        { status: 400 }
      );
    }
    const { setId, wsId } = parsedParams.data;
    const moduleIds = [...new Set(parsedBody.data.moduleIds)];
    const access = await requireQuizModuleAccess(
      context,
      wsId,
      setId,
      moduleIds
    );
    if (access instanceof NextResponse) return access;

    const { error } = await access.sbAdmin
      .from('course_module_quiz_sets')
      .upsert(
        moduleIds.map((moduleId) => ({ module_id: moduleId, set_id: setId }))
      );
    if (error) {
      console.error('Failed to link quiz-set modules', error);
      return NextResponse.json(
        { message: 'Failed to link quiz set modules' },
        { status: 500 }
      );
    }
    return NextResponse.json({ message: 'success' });
  },
  { rateLimit: { windowMs: 60000, maxRequests: 30 } }
);
