import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import { requireEducationWorkspaceAccess } from '@/lib/education/access';

const RouteParamsSchema = z.object({
  setId: z.guid(),
  wsId: z.string().min(1),
});

const QuizSetUpdateSchema = z.object({
  name: z.string().trim().min(1).max(255),
});

export const PUT = withSessionAuth(
  async (
    request,
    context,
    params:
      | { wsId: string; setId: string }
      | Promise<{ wsId: string; setId: string }>
  ) => {
    const parsedParams = RouteParamsSchema.safeParse(await params);
    if (!parsedParams.success) {
      return NextResponse.json(
        { message: 'Invalid route params', errors: parsedParams.error.issues },
        { status: 400 }
      );
    }

    const access = await requireEducationWorkspaceAccess({
      context,
      wsId: parsedParams.data.wsId,
    });
    if (access instanceof NextResponse) return access;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { message: 'Invalid request body' },
        { status: 400 }
      );
    }

    const parsedBody = QuizSetUpdateSchema.safeParse(body);
    if (!parsedBody.success) {
      return NextResponse.json(
        { message: 'Invalid request body', errors: parsedBody.error.issues },
        { status: 400 }
      );
    }

    const { data, error } = await context.supabase
      .from('workspace_quiz_sets')
      .update({ name: parsedBody.data.name })
      .eq('id', parsedParams.data.setId)
      .eq('ws_id', access.normalizedWsId)
      .select('id')
      .maybeSingle();

    if (error) {
      console.error('Failed to update workspace quiz set', error);
      return NextResponse.json(
        { message: 'Error updating workspace quiz set' },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { message: 'Quiz set not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ message: 'success' });
  },
  { rateLimit: { windowMs: 60000, maxRequests: 60 } }
);

export const DELETE = withSessionAuth(
  async (
    _request,
    context,
    params:
      | { wsId: string; setId: string }
      | Promise<{ wsId: string; setId: string }>
  ) => {
    const parsedParams = RouteParamsSchema.safeParse(await params);
    if (!parsedParams.success) {
      return NextResponse.json(
        { message: 'Invalid route params', errors: parsedParams.error.issues },
        { status: 400 }
      );
    }

    const access = await requireEducationWorkspaceAccess({
      context,
      wsId: parsedParams.data.wsId,
    });
    if (access instanceof NextResponse) return access;

    const { data, error } = await context.supabase
      .from('workspace_quiz_sets')
      .delete()
      .eq('id', parsedParams.data.setId)
      .eq('ws_id', access.normalizedWsId)
      .select('id')
      .maybeSingle();

    if (error) {
      console.error('Failed to delete workspace quiz set', error);
      return NextResponse.json(
        { message: 'Error deleting workspace quiz set' },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { message: 'Quiz set not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ message: 'success' });
  },
  { rateLimit: { windowMs: 60000, maxRequests: 60 } }
);
