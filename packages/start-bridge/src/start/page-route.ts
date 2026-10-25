import type { ReactNode } from 'react';

/**
 * Renders an App Router page (async server component) and its layouts for a
 * TanStack Start route with React Server Components enabled. Call it from an
 * app-owned `createServerFn` handler (the RSC environment); return its result
 * from the route loader and render `node` in the route component.
 *
 * The page and each layout are awaited here, before streaming, so
 * `notFound()`/`redirect()` thrown in their bodies reach the router as a 404
 * or redirect. Nested async server components still stream through RSC.
 */
export interface AppRouterModule {
  default: (props: never) => ReactNode | Promise<ReactNode>;
  generateMetadata?: (props: never, parent: Promise<NextMetadata>) => unknown;
  metadata?: NextMetadata;
}

export interface NextMetadata {
  title?:
    | string
    | { default?: string; template?: string; absolute?: string }
    | null;
  description?: string | null;
  robots?: string | { index?: boolean; follow?: boolean } | null;
  alternates?: { canonical?: string | URL | null } | null;
  openGraph?: {
    title?: string;
    description?: string;
    url?: string | URL;
    siteName?: string;
    images?: unknown;
  } | null;
  other?: Record<string, string | number | (string | number)[]>;
}

export interface HeadDescriptor {
  meta: Record<string, string>[];
  links: Record<string, string>[];
}

export interface RenderPageOptions {
  /** The page module (`() => import('../app/.../page')`). */
  page: () => Promise<AppRouterModule>;
  /** Layout modules from the root down; each receives `children`. */
  layouts?: readonly (() => Promise<AppRouterModule>)[];
  params: Record<string, string | string[]>;
  searchParams?: Record<string, string | string[]>;
  /** `renderServerComponent` from `@tanstack/react-start/rsc`. */
  render: (element: ReactNode) => Promise<unknown>;
}

function titleOf(
  title: NextMetadata['title'],
  template: string | undefined
): string | undefined {
  if (!title) return undefined;
  if (typeof title === 'string')
    return template ? template.replace('%s', title) : title;
  if (title.absolute) return title.absolute;
  return title.default;
}

/** Maps the Next metadata fields the satellites use to TanStack `head()`. */
export function metadataToHead(chain: readonly NextMetadata[]): HeadDescriptor {
  let template: string | undefined;
  const merged: NextMetadata = {};
  let title: string | undefined;
  for (const metadata of chain) {
    const current = titleOf(metadata.title, template);
    if (current !== undefined) title = current;
    if (metadata.title && typeof metadata.title === 'object')
      template = metadata.title.template ?? template;
    Object.assign(merged, metadata);
  }
  const meta: Record<string, string>[] = [];
  const links: Record<string, string>[] = [];
  if (title) meta.push({ title });
  if (merged.description)
    meta.push({ name: 'description', content: merged.description });
  if (merged.robots)
    meta.push({
      name: 'robots',
      content:
        typeof merged.robots === 'string'
          ? merged.robots
          : `${merged.robots.index === false ? 'noindex' : 'index'}, ${merged.robots.follow === false ? 'nofollow' : 'follow'}`,
    });
  const og = merged.openGraph;
  if (og?.title) meta.push({ property: 'og:title', content: og.title });
  if (og?.description)
    meta.push({ property: 'og:description', content: og.description });
  if (og?.url) meta.push({ property: 'og:url', content: String(og.url) });
  if (og?.siteName)
    meta.push({ property: 'og:site_name', content: og.siteName });
  for (const [name, value] of Object.entries(merged.other ?? {}))
    for (const item of Array.isArray(value) ? value : [value])
      meta.push({ name, content: String(item) });
  const canonical = merged.alternates?.canonical;
  if (canonical) links.push({ rel: 'canonical', href: String(canonical) });
  return { meta, links };
}

async function metadataOf(
  module: AppRouterModule,
  props: unknown,
  parent: Promise<NextMetadata>
): Promise<NextMetadata> {
  if (module.generateMetadata)
    return ((await module.generateMetadata(props as never, parent)) ??
      {}) as NextMetadata;
  return module.metadata ?? {};
}

export async function renderAppRouterPage(options: RenderPageOptions) {
  const params = Promise.resolve(options.params);
  const searchParams = Promise.resolve(options.searchParams ?? {});
  const [page, ...layouts] = await Promise.all([
    options.page(),
    ...(options.layouts ?? []).map((load) => load()),
  ]);
  if (!page) throw new Error('Missing App Router page module');

  // Metadata resolves root-down so a layout's title template applies.
  const chain: NextMetadata[] = [];
  let parent: Promise<NextMetadata> = Promise.resolve({});
  for (const module of [...layouts, page]) {
    const resolved = await metadataOf(module, { params, searchParams }, parent);
    chain.push(resolved);
    parent = Promise.resolve({ ...(await parent), ...resolved });
  }

  let element: ReactNode = await page.default({
    params,
    searchParams,
  } as never);
  for (const layout of layouts.toReversed())
    element = await layout.default({ children: element, params } as never);
  return { head: metadataToHead(chain), node: await options.render(element) };
}
