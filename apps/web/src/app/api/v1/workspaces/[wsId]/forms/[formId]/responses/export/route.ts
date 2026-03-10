import { XLSX } from '@tuturuuu/ui/xlsx';
import { type NextRequest, NextResponse } from 'next/server';
import { isAnswerableQuestionType } from '@/features/forms/block-utils';
import { normalizeMarkdownToText } from '@/features/forms/content';
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
    const format = request.nextUrl.searchParams.get('format');
    const resolvedFormat =
      format === 'excel' || format === 'xlsx' ? 'xlsx' : 'csv';

    const knownColumns = form.sections.flatMap((section) =>
      section.questions
        .filter((question) => isAnswerableQuestionType(question.type))
        .map((question) => ({
          key: question.id,
          label: normalizeMarkdownToText(question.title).trim() || question.id,
        }))
    );
    const extraAnswerKeys = Array.from(
      new Set(
        responses.records.flatMap((record) => Object.keys(record.answers))
      )
    );
    const columns = [
      ...knownColumns,
      ...extraAnswerKeys
        .filter(
          (answerKey) =>
            !knownColumns.some((column) => column.key === answerKey)
        )
        .map((answerKey) => ({
          key: answerKey,
          label: answerKey,
        })),
    ];
    const header = [
      'Submitted at',
      'Responder',
      ...columns.map((column) => column.label),
    ];
    const rows = responses.records.map((record) => {
      const values = columns.map((column) =>
        String(record.answers[column.key]?.value ?? '')
      );

      return [
        record.submittedAt,
        record.respondentEmail || record.respondentUserId || 'Anonymous',
        ...values,
      ];
    });

    if (resolvedFormat === 'xlsx') {
      const worksheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
      const workbook = XLSX.utils.book_new();

      XLSX.utils.book_append_sheet(workbook, worksheet, 'Responses');

      const excelBuffer = XLSX.write(workbook, {
        bookType: 'xlsx',
        type: 'array',
      });

      return new NextResponse(excelBuffer, {
        headers: {
          'Content-Type':
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="form-${formId}-responses.xlsx"`,
        },
      });
    }

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
