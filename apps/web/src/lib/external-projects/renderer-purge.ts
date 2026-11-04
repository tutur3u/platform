import { z } from 'zod';

const sitesSchema = z.record(
  z.string(),
  z.object({
    id: z.string().min(1),
    workspaceId: z.uuid(),
    defaultLocale: z.string().min(2).max(10),
  })
);

export function rendererPurgeTarget({
  workspaceId,
  siteId,
  slug,
  version,
}: {
  workspaceId: string;
  siteId: string;
  slug: string;
  version: string;
}) {
  const sites = sitesSchema.parse(
    JSON.parse(process.env.CMS_RENDERER_SITES ?? '{}')
  );
  const matches = Object.entries(sites).filter(
    ([, site]) => site.workspaceId === workspaceId && site.id === siteId
  );
  const match = matches[0];
  const token = process.env.CMS_PURGE_TOKEN;
  if (matches.length !== 1 || !match || !token)
    throw new Error('Renderer purge is not configured');
  const [host, site] = match;
  if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(host))
    throw new Error('Invalid renderer host');
  const path = slug === 'home' ? '/' : `/${slug.replace(/^\/+|\/+$/g, '')}`;
  if (path.length > 2048 || path.includes('?') || path.includes('#'))
    throw new Error('Invalid page path');
  return {
    url: `https://${host}/__cms/purge`,
    token,
    body: {
      path,
      locale: /^\/en(?:\/|$)/.test(path) ? 'en' : site.defaultLocale,
      version,
    },
  };
}

export async function purgeRendererPage(
  target: ReturnType<typeof rendererPurgeTarget>,
  send: typeof fetch = fetch
): Promise<'purged' | 'failed'> {
  try {
    const response = await send(target.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${target.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(target.body),
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
    });
    await response.body?.cancel();
    return response.status === 204 ? 'purged' : 'failed';
  } catch {
    return 'failed';
  }
}
