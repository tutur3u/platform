import { getCloudflareContext } from '@opennextjs/cloudflare';

export async function bindings() {
  const { env } = await getCloudflareContext({ async: true });
  return {
    db: env.LETTIN_DB.withSession('first-primary'),
    media: env.LETTIN_MEDIA,
  };
}
