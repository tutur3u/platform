/**
 * The subset of Next's `Metadata`/`Viewport` model satellites use, resolved
 * across the layout chain and converted to TanStack Router `head()` data.
 * Merging follows Next: later segments shallowly override earlier ones, and
 * a layout's `title.template` formats every descendant's string title.
 */

type Title =
  | string
  | null
  | { default?: string; template?: string; absolute?: string };

export interface BridgeMetadata {
  title?: Title;
  description?: string | null;
  applicationName?: string | null;
  keywords?: string | readonly string[] | null;
  authors?: unknown;
  creator?: string | null;
  publisher?: string | null;
  robots?: string | { index?: boolean; follow?: boolean } | null;
  alternates?: {
    canonical?: string | URL | null;
    languages?: Record<string, string | URL | null>;
  } | null;
  openGraph?: Record<string, unknown> | null;
  twitter?: Record<string, unknown> | null;
  icons?: unknown;
  manifest?: string | URL | null;
  metadataBase?: URL | string | null;
  other?: Record<string, string | number | readonly (string | number)[]>;
  [key: string]: unknown;
}

export interface BridgeViewport {
  themeColor?:
    | string
    | readonly { color: string; media?: string }[]
    | { color: string; media?: string }
    | null;
  colorScheme?: string | null;
  width?: string | number;
  initialScale?: number;
  maximumScale?: number;
  viewportFit?: string;
  [key: string]: unknown;
}

export interface BridgeHead {
  meta: Record<string, string>[];
  links: Record<string, string>[];
}

/**
 * A page or layout module as Next apps write it. App modules use Next's own
 * `Metadata`/`Viewport` and `Props` types, so the surface is deliberately
 * loose; values are read as the bridge subset above.
 */
export interface MetadataModule {
  metadata?: object;
  generateMetadata?: (props: never, parent: never) => unknown;
  viewport?: object;
  generateViewport?: (props: never) => unknown;
}

type MetadataProps = {
  params: Promise<unknown>;
  searchParams: Promise<unknown>;
};
type GenerateMetadata = (
  props: MetadataProps,
  parent: Promise<BridgeMetadata>
) => BridgeMetadata | Promise<BridgeMetadata>;
type GenerateViewport = (props: {
  params: Promise<unknown>;
}) => BridgeViewport | Promise<BridgeViewport>;

function resolveTitle(title: Title | undefined, template: string | undefined) {
  if (title === undefined || title === null) return { value: undefined };
  if (typeof title === 'string')
    return { value: template ? template.replace('%s', title) : title };
  if (title.absolute)
    return { value: title.absolute, template: title.template };
  const value = title.default
    ? template
      ? template.replace('%s', title.default)
      : title.default
    : undefined;
  return { value, template: title.template };
}

/** Resolves `metadata`/`generateMetadata` for the chain, outermost first. */
export async function resolveMetadata(
  modules: readonly MetadataModule[],
  props: { params: Promise<unknown>; searchParams: Promise<unknown> }
) {
  let merged: BridgeMetadata = {};
  let template: string | undefined;
  let title: string | undefined;
  for (const module of modules) {
    const current = (
      module.generateMetadata
        ? await (module.generateMetadata as GenerateMetadata)(
            props,
            Promise.resolve(merged)
          )
        : module.metadata
    ) as BridgeMetadata | undefined;
    if (!current) continue;
    const resolved = resolveTitle(current.title, template);
    if (resolved.value !== undefined) title = resolved.value;
    if (resolved.template !== undefined) template = resolved.template;
    merged = { ...merged, ...current };
  }
  return { ...merged, title: title ?? null } satisfies BridgeMetadata;
}

export async function resolveViewport(
  modules: readonly MetadataModule[],
  params: Promise<unknown>
) {
  let merged: BridgeViewport = {};
  for (const module of modules) {
    const current = (
      module.generateViewport
        ? await (module.generateViewport as GenerateViewport)({ params })
        : module.viewport
    ) as BridgeViewport | undefined;
    if (current) merged = { ...merged, ...current };
  }
  return merged;
}

const text = (value: unknown) =>
  value === undefined || value === null ? undefined : String(value);

function pushOpenGraph(
  meta: Record<string, string>[],
  prefix: 'og' | 'twitter',
  values: Record<string, unknown>
) {
  const attribute = prefix === 'og' ? 'property' : 'name';
  for (const [key, raw] of Object.entries(values)) {
    if (raw === undefined || raw === null) continue;
    const name =
      prefix === 'og'
        ? `og:${key.replace(/[A-Z]/gu, (c) => `_${c.toLowerCase()}`)}`
        : `twitter:${key}`;
    if (key === 'images' || key === 'image') {
      const images = Array.isArray(raw) ? raw : [raw];
      for (const image of images) {
        const url =
          typeof image === 'object' && image && 'url' in image
            ? (image as { url: unknown }).url
            : image;
        meta.push({ [attribute]: `${prefix}:image`, content: String(url) });
      }
    } else if (typeof raw !== 'object' || raw instanceof URL) {
      meta.push({
        [attribute]: name === 'og:site_name' ? 'og:site_name' : name,
        content: String(raw),
      });
    }
  }
}

function robots(value: BridgeMetadata['robots']) {
  if (!value) return undefined;
  if (typeof value === 'string') return value;
  return [
    value.index === false ? 'noindex' : 'index',
    value.follow === false ? 'nofollow' : 'follow',
  ].join(', ');
}

export function toHead(
  metadata: BridgeMetadata,
  viewport: BridgeViewport
): BridgeHead {
  const meta: Record<string, string>[] = [{ charSet: 'utf-8' }];
  const links: Record<string, string>[] = [];
  const viewportParts = [
    `width=${viewport.width ?? 'device-width'}`,
    `initial-scale=${viewport.initialScale ?? 1}`,
    ...(viewport.maximumScale
      ? [`maximum-scale=${viewport.maximumScale}`]
      : []),
    ...(viewport.viewportFit ? [`viewport-fit=${viewport.viewportFit}`] : []),
  ];
  meta.push({ name: 'viewport', content: viewportParts.join(', ') });
  const colors = viewport.themeColor
    ? Array.isArray(viewport.themeColor)
      ? viewport.themeColor
      : [viewport.themeColor]
    : [];
  for (const color of colors as ({ color: string; media?: string } | string)[])
    meta.push(
      typeof color === 'string'
        ? { name: 'theme-color', content: color }
        : {
            name: 'theme-color',
            content: color.color,
            ...(color.media ? { media: color.media } : {}),
          }
    );
  if (viewport.colorScheme)
    meta.push({ name: 'color-scheme', content: viewport.colorScheme });
  const title = text(metadata.title);
  if (title) meta.push({ title });
  for (const [name, value] of [
    ['description', metadata.description],
    ['application-name', metadata.applicationName],
    ['creator', metadata.creator],
    ['publisher', metadata.publisher],
    ['robots', robots(metadata.robots)],
    [
      'keywords',
      Array.isArray(metadata.keywords)
        ? metadata.keywords.join(',')
        : metadata.keywords,
    ],
  ] as const) {
    const content = text(value);
    if (content) meta.push({ name, content });
  }
  if (metadata.openGraph) pushOpenGraph(meta, 'og', metadata.openGraph);
  if (metadata.twitter) pushOpenGraph(meta, 'twitter', metadata.twitter);
  for (const [name, value] of Object.entries(metadata.other ?? {}))
    for (const item of Array.isArray(value) ? value : [value])
      meta.push({ name, content: String(item) });
  const canonical = text(metadata.alternates?.canonical);
  if (canonical) links.push({ rel: 'canonical', href: canonical });
  for (const [hrefLang, href] of Object.entries(
    metadata.alternates?.languages ?? {}
  ))
    if (href) links.push({ rel: 'alternate', hrefLang, href: String(href) });
  const manifest = text(metadata.manifest);
  if (manifest) links.push({ rel: 'manifest', href: manifest });
  const icons = metadata.icons as
    | string
    | { icon?: unknown; apple?: unknown; shortcut?: unknown }
    | undefined;
  const iconLinks: [string, unknown][] =
    typeof icons === 'string'
      ? [['icon', icons]]
      : icons
        ? [
            ['icon', icons.icon],
            ['shortcut icon', icons.shortcut],
            ['apple-touch-icon', icons.apple],
          ]
        : [];
  for (const [rel, value] of iconLinks)
    for (const item of Array.isArray(value) ? value : value ? [value] : [])
      links.push({
        rel,
        href: String(
          typeof item === 'object' && item && 'url' in item
            ? (item as { url: unknown }).url
            : item
        ),
      });
  return { meta, links };
}
