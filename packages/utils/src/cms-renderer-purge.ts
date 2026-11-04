import { z } from 'zod';

const sitesSchema = z.record(
  z.string(),
  z.object({
    id: z.string().min(1),
    purgeToken: z.string().regex(/^[A-Za-z0-9_-]{43,}$/),
    workspaceId: z.uuid(),
    defaultLocale: z.string().min(2).max(10),
  })
);

function configuredRendererSites() {
  let sites: z.infer<typeof sitesSchema>;
  try {
    sites = sitesSchema.parse(
      JSON.parse(process.env.CMS_RENDERER_SITES ?? '{}')
    );
    const tokens = Object.values(sites).map((site) => site.purgeToken);
    if (new Set(tokens).size !== tokens.length)
      throw new Error('Renderer tokens must be unique per site');
  } catch {
    throw new Error('Invalid CMS_RENDERER_SITES configuration');
  }
  return sites;
}

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
  const sites = configuredRendererSites();
  const matches = Object.entries(sites).filter(
    ([, site]) => site.workspaceId === workspaceId && site.id === siteId
  );
  const match = matches[0];
  if (matches.length !== 1 || !match)
    throw new Error('Renderer purge is not configured');
  const [host, site] = match;
  if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(host))
    throw new Error('Invalid renderer host');
  const path = slug === 'home' ? '/' : `/${slug.replace(/^\/+|\/+$/g, '')}`;
  if (path.length > 2048 || path.includes('?') || path.includes('#'))
    throw new Error('Invalid page path');
  return {
    url: `https://${host}/__cms/purge`,
    token: site.purgeToken,
    body: {
      path,
      locale: /^\/en(?:\/|$)/.test(path) ? 'en' : site.defaultLocale,
      version,
    },
  };
}

export async function purgeRendererPage(
  target: {
    url: string;
    token: string;
    body:
      | ReturnType<typeof rendererPurgeTarget>['body']
      | { scope: 'workspace' };
  },
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

export async function purgeWorkspaceRenderers(workspaceId: string) {
  const sites = configuredRendererSites();
  const failures: string[] = [];
  for (const [host, site] of Object.entries(sites)) {
    if (site.workspaceId !== workspaceId) continue;
    if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(host))
      throw new Error('Invalid renderer host');
    const result = await purgeRendererPage({
      url: `https://${host}/__cms/purge`,
      token: site.purgeToken,
      body: { scope: 'workspace' },
    });
    if (result === 'failed') {
      console.error('CMS renderer purge failed after committed mutation', {
        siteId: site.id,
      });
      failures.push(site.id);
    }
  }
  if (failures.length)
    throw new Error(
      'Content change committed but renderer cache invalidation failed'
    );
}
