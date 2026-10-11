import type { NextRequest } from 'next/server';
import { connectedMailRoute } from '@/lib/mail/connected/route';

type Context = { params: Promise<{ wsId: string; segments?: string[] }> };
async function handle(request: NextRequest, context: Context) {
  const { wsId, segments = [] } = await context.params;
  return connectedMailRoute(request, wsId, segments);
}

export { handle as GET, handle as POST, handle as DELETE };
