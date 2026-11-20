import { connection, NextResponse } from 'next/server';
import { requireWorkspaceExternalProjectManageDecision } from '@/lib/external-projects/access';

const headers = { 'Cache-Control': 'private, no-store' };

export async function GET(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  await connection();
  const { wsId } = await params;
  const unavailable = () =>
    NextResponse.json({ error: 'Authorization unavailable' }, { status: 503, headers });
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    const access = await Promise.race([
      requireWorkspaceExternalProjectManageDecision(request, wsId),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), 4000);
      }),
    ]);
    if (!access) return unavailable();
    if (!access.ok) {
      return NextResponse.json(
        { error: 'Authorization denied' },
        { status: access.response.status, headers }
      );
    }

    return NextResponse.json(access.decision, { headers });
  } catch {
    return unavailable();
  } finally {
    clearTimeout(timer);
  }
}
