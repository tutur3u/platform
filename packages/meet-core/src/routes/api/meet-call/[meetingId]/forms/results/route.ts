import { MeetCallAccessError } from '@tuturuuu/meet-core/features/call/lib/call-access';
import { meetFormsRoute } from '../../../../../../features/call/server/forms/route-guard';
import { connection } from 'next/server';
import { z } from 'zod';
import { summarizeFormsResults } from '../../../../../../features/call/server/forms-results/mira-summary';
import { loadLaunchResults } from '../../../../../../features/call/server/forms-results/read-launch';
import {
  exportFormsResults,
  FormsResultsAccessError,
  readFormsResults,
} from '../../../../../../features/call/server/forms-results/results';

const resultsQuery = z.strictObject({
  launchId: z.uuid(),
  format: z.literal('csv').optional(),
});
const summaryQuery = z.strictObject({
  launchId: z.uuid(),
  locale: z.enum(['en', 'vi']).default('en'),
});
const requestIdSchema = z.uuid();

type Params = { params: Promise<{ meetingId: string }> };
type Access = Parameters<Parameters<typeof meetFormsRoute>[2]>[0];

function parseQuery<T>(request: Request, schema: z.ZodType<T>): T {
  const query = new URL(request.url).searchParams;
  const entries = Object.fromEntries(query);
  const parsed = schema.safeParse(entries);
  if (!parsed.success || query.size !== Object.keys(entries).length) {
    throw new MeetCallAccessError(400, 'Invalid form results request');
  }
  return parsed.data;
}

async function authorizedResults(access: Access, launchId: string) {
  try {
    return await readFormsResults(
      { isHost: access.isHost, meetingId: access.meeting.id, launchId },
      () => loadLaunchResults(access, launchId)
    );
  } catch (error) {
    if (error instanceof FormsResultsAccessError) {
      throw new MeetCallAccessError(error.status, error.message);
    }
    if (error instanceof z.ZodError) {
      throw new MeetCallAccessError(502, 'Form results are unavailable');
    }
    throw error;
  }
}

export async function GET(request: Request, { params }: Params) {
  await connection();
  const { meetingId } = await params;
  return meetFormsRoute(request, meetingId, async (access) => {
    const { launchId, format } = parseQuery(request, resultsQuery);
    const results = await authorizedResults(access, launchId);
    if (format !== 'csv') return results;
    return new Response(exportFormsResults(results), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="form-${launchId}-results.csv"`,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  });
}

export async function POST(request: Request, { params }: Params) {
  const { meetingId } = await params;
  return meetFormsRoute(request, meetingId, async (access) => {
    const { launchId, locale } = parseQuery(request, summaryQuery);
    const requestId = requestIdSchema.parse(
      request.headers.get('Idempotency-Key')
    );
    const results = await authorizedResults(access, launchId);
    return summarizeFormsResults(access, results, locale, requestId);
  });
}
