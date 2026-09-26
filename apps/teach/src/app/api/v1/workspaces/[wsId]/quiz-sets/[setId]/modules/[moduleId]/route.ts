import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import { requireQuizModuleAccess } from '@/lib/quiz-module-access';

const ParamsSchema = z.object({
  wsId: z.string().min(1),
  setId: z.guid(),
  moduleId: z.guid(),
});
type Params = { wsId: string; setId: string; moduleId: string };

export const DELETE = withSessionAuth(
  async (_request, context, params: Params | Promise<Params>) => {
    const parsed = ParamsSchema.safeParse(await params);
    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Invalid route params' },
        { status: 400 }
      );
    }
    const { setId, moduleId, wsId } = parsed.data;
    const access = await requireQuizModuleAccess(context, wsId, setId, [
      moduleId,
    ]);
    if (access instanceof NextResponse) return access;

    const { error } = await access.sbAdmin
      .from('course_module_quiz_sets')
      .delete()
      .eq('module_id', moduleId)
      .eq('set_id', setId);
    if (error) {
      console.error('Failed to unlink quiz-set module', error);
      return NextResponse.json(
        { message: 'Failed to unlink quiz set module' },
        { status: 500 }
      );
    }
    return NextResponse.json({ message: 'success' });
  },
  { rateLimit: { windowMs: 60000, maxRequests: 30 } }
);
