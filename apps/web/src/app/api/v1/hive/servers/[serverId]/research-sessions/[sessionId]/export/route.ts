import { type NextRequest, NextResponse } from 'next/server';
import { getHiveResearchSessionExport } from '@/lib/hive/research-sessions';
import { requireHiveAccess, withHiveRoute } from '../../../../../_shared';

type Params = {
  params: Promise<{
    serverId: string;
    sessionId: string;
  }>;
};

const ROUTE =
  '/api/v1/hive/servers/[serverId]/research-sessions/[sessionId]/export';

function toJsonl(
  value: Awaited<ReturnType<typeof getHiveResearchSessionExport>>
) {
  if (!value) return '';
  return [
    JSON.stringify({ kind: 'session', session: value.session }),
    ...value.timeline.map((item) => JSON.stringify(item)),
  ].join('\n');
}

export async function GET(request: NextRequest, { params }: Params) {
  const { serverId, sessionId } = await params;

  return withHiveRoute(request, ROUTE, async () => {
    const access = await requireHiveAccess(request);
    if (!access.ok) return access.response;

    const researchExport = await getHiveResearchSessionExport({
      serverId,
      sessionId,
    });

    if (!researchExport) {
      return NextResponse.json(
        { error: 'Hive research session not found' },
        { status: 404 }
      );
    }

    if (request.nextUrl.searchParams.get('format') === 'jsonl') {
      return new NextResponse(toJsonl(researchExport), {
        headers: {
          'content-disposition': `attachment; filename="hive-research-${sessionId}.jsonl"`,
          'content-type': 'application/x-ndjson; charset=utf-8',
        },
      });
    }

    return NextResponse.json(researchExport, {
      headers: {
        'content-disposition': `attachment; filename="hive-research-${sessionId}.json"`,
      },
    });
  });
}
