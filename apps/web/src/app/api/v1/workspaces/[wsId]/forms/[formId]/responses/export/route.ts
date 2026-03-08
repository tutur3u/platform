import { type NextRequest, NextResponse } from 'next/server';
import {
  getWorkspaceRouteContext,
  parseFormIdParam,
} from '@/features/forms/route-utils';
import {
  fetchFormDefinition,
  listFormResponses,
} from '@/features/forms/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string; formId: string }> }
) {
  try {
    const { wsId: wsIdParam, formId: formIdParam } = await params;
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

    const formId = parseFormIdParam(formIdParam, 'form ID');
    const form = await fetchFormDefinition(context.adminClient, formId);

    if (!form || form.wsId !== context.wsId) {
      return NextResponse.json({ error: 'Form not found' }, { status: 404 });
    }

    const responses = await listFormResponses(context.adminClient, form, {
      query: request.nextUrl.searchParams.get('q') ?? undefined,
      page: 1,
      pageSize: 5000,
    });

    const columns = Array.from(
      new Set(
        responses.records.flatMap((record) => Object.keys(record.answers))
      )
    );
    const header = ['submitted_at', 'respondent', ...columns];
    const rows = responses.records.map((record) => [
      record.submittedAt,
      record.respondentEmail || record.respondentUserId || 'Anonymous',
      ...columns.map((column) => String(record.answers[column]?.value ?? '')),
    ]);

    const csv = [header, ...rows]
      .map((row) =>
        row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')
      )
      .join('\n');

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="form-${formId}-responses.csv"`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
