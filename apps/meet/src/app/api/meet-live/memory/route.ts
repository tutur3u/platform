import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { connection } from 'next/server';
import { memoryCommandSchema } from '@/features/live-assistant/memory-command';
import { mutatePrivateLiveMemory } from '@/features/live-assistant/privacy-reset';
import { readLiveRequestBody } from '@/features/live-assistant/request-body';

const headers = { 'Cache-Control': 'private, no-store' };
export async function GET() {
  await connection();
  const user = await getSatelliteAppSessionUser('meet');
  if (!user)
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers });
  const db = await createAdminClient({ noCookie: true });
  const [preferences, memories] = await Promise.all([
    db
      .from('meet_ai_user_preferences')
      .select('memory_enabled')
      .eq('user_id', user.id)
      .maybeSingle(),
    db
      .from('meet_ai_memories')
      .select('id,content,category,created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100),
  ]);
  if (preferences.error || memories.error)
    return Response.json(
      { error: 'Memory is unavailable' },
      { status: 503, headers }
    );
  return Response.json(
    {
      enabled: preferences.data?.memory_enabled === true,
      memories: memories.data,
    },
    { headers }
  );
}
export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin)
    return Response.json({ error: 'Invalid origin' }, { status: 403, headers });
  const user = await getSatelliteAppSessionUser('meet');
  if (!user)
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers });
  const body = await readLiveRequestBody(request, 8000);
  if (!body.ok)
    return Response.json(
      { error: 'Invalid request body' },
      { status: body.status, headers }
    );
  const parsed = memoryCommandSchema.safeParse(body.data);
  if (!parsed.success)
    return Response.json(
      { error: 'Invalid request' },
      { status: 400, headers }
    );
  try {
    const result = await mutatePrivateLiveMemory(user.id, parsed.data);
    return Response.json(result, { status: result.ok ? 200 : 404, headers });
  } catch {
    return Response.json(
      { error: 'Memory update could not be completed. Try again.' },
      { status: 503, headers }
    );
  }
}
