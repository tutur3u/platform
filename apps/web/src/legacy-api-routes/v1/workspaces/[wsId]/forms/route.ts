import { type NextRequest, NextResponse } from 'next/server';
import { getWorkspaceRouteContext } from '@/features/forms/route-utils';
import { formStudioSchema } from '@/features/forms/schema';
import { listForms, saveFormDefinition } from '@/features/forms/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const { wsId: wsIdParam } = await params;
    const context = await getWorkspaceRouteContext(request, wsIdParam);

    if (!context.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (
      !context.isMember ||
      (!context.canManageForms && !context.canViewAnalytics)
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const items = await listForms(
      context.adminClient,
      context.wsId,
      wsIdParam,
      request.nextUrl.searchParams.get('q') ?? undefined
    );

    return NextResponse.json({ items });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const { wsId: wsIdParam } = await params;
    const context = await getWorkspaceRouteContext(request, wsIdParam);

    if (!context.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!context.isMember || !context.canManageForms) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const parsed = formStudioSchema.safeParse(body);

    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      const path =
        (firstIssue?.path?.length ?? 0) > 0
          ? `${firstIssue!.path!.join('.')}: `
          : '';
      const message = firstIssue?.message ?? 'Validation failed';
      return NextResponse.json({ error: `${path}${message}` }, { status: 400 });
    }

    const id = await saveFormDefinition({
      supabase: context.adminClient,
      wsId: context.wsId,
      creatorId: context.user.id,
      input: parsed.data,
    });

    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
