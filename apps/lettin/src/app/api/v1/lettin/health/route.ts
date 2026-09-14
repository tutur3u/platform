import { getCloudflareContext } from '@opennextjs/cloudflare';
import { connection } from 'next/server';
import { handle, respond } from '@/server/http';
export function GET() {
  return handle(async () => {
    await connection();
    const { env } = await getCloudflareContext({ async: true });
    await env.LETTIN_DB.prepare('SELECT id FROM worlds LIMIT 0').all();
    await env.LETTIN_MEDIA.head('__health');
    return respond({
      service: 'lettin',
      status: 'ok',
      storage: { database: 'd1', artwork: 'r2' },
      deployment: env.CF_VERSION_METADATA,
    });
  });
}
