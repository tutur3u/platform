import { requireEducationWorkspaceAccess } from '@tuturuuu/education-core/education/access';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';

const RouteParamsSchema = z.object({
  flashcardId: z.guid(),
  wsId: z.string().min(1),
});

const FlashcardUpdateSchema = z.object({
  front: z.string().trim().min(1).max(4000),
  back: z.string().trim().min(1).max(4000),
});

export const PUT = withSessionAuth(
  async (
    request,
    context,
    params:
      | { wsId: string; flashcardId: string }
      | Promise<{ wsId: string; flashcardId: string }>
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

    const parsedBody = FlashcardUpdateSchema.safeParse(body);
    if (!parsedBody.success) {
      return NextResponse.json(
        { message: 'Invalid request body', errors: parsedBody.error.issues },
        { status: 400 }
      );
    }

    const { data, error } = await context.supabase
      .from('workspace_flashcards')
      .update(parsedBody.data)
      .eq('id', parsedParams.data.flashcardId)
      .eq('ws_id', access.normalizedWsId)
      .select('id')
      .maybeSingle();

    if (error) {
      console.error('Failed to update workspace flashcard', error);
      return NextResponse.json(
        { message: 'Error updating workspace flashcard' },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { message: 'Flashcard not found' },
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
      | { wsId: string; flashcardId: string }
      | Promise<{ wsId: string; flashcardId: string }>
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
      .from('workspace_flashcards')
      .delete()
      .eq('id', parsedParams.data.flashcardId)
      .eq('ws_id', access.normalizedWsId)
      .select('id')
      .maybeSingle();

    if (error) {
      console.error('Failed to delete workspace flashcard', error);
      return NextResponse.json(
        { message: 'Error deleting workspace flashcard' },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { message: 'Flashcard not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ message: 'success' });
  },
  { rateLimit: { windowMs: 60000, maxRequests: 60 } }
);
