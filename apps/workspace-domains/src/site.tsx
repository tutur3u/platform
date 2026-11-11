import {
  CmsPageRenderer,
  renderCmsBlock,
  safeUrl,
  TipTapContent,
} from '@tuturuuu/cms-blocks/render';
import {
  cmsBlockSchema,
  cmsPageSchema,
  tipTapDocSchema,
} from '@tuturuuu/cms-blocks/schema';
import type { ReactNode } from 'react';
import { BASE_STYLES, POWERED_BY_URL } from './html';
import type { ResolvedWorkspace } from './resolve';

/**
 * The subset of the public External Projects delivery payload
 * (`GET /api/v1/workspaces/:wsId/external-projects/delivery`) this Worker reads.
 * Everything is validated defensively: the payload is public data, but the
 * Worker must not crash on unexpected shapes.
 */
export interface DeliveryBlock {
  id: string;
  block_type: string;
  content: unknown;
  sort_order: number;
  title?: string | null;
}
export interface DeliveryAsset {
  id: string;
  asset_type: string;
  assetUrl: string | null;
  alt_text: string | null;
  sort_order: number;
}
export interface DeliveryEntry {
  id: string;
  slug: string;
  title: string;
  subtitle?: string | null;
  summary?: string | null;
  blocks: DeliveryBlock[];
  assets: DeliveryAsset[];
}
export interface DeliveryCollection {
  id: string;
  slug: string;
  title: string;
  collection_type?: string | null;
  description?: string | null;
  entries: DeliveryEntry[];
}
export interface DeliveryPayload {
  revision?: string;
  collections: DeliveryCollection[];
  profileData?: Record<string, unknown>;
}

export type SitePage =
  | { kind: 'entry'; collection: DeliveryCollection; entry: DeliveryEntry }
  | { kind: 'collection'; collection: DeliveryCollection }
  | { kind: 'index' };

const HOME_SLUGS = ['home', 'index'];
const PAGE_COLLECTION_SLUGS = ['pages', 'page', 'site-pages'];

export function isDeliveryPayload(value: unknown): value is DeliveryPayload {
  if (!value || typeof value !== 'object') return false;
  const collections = (value as { collections?: unknown }).collections;
  return (
    Array.isArray(collections) &&
    collections.every(
      (collection) =>
        collection &&
        typeof collection === 'object' &&
        typeof collection.slug === 'string' &&
        Array.isArray(collection.entries)
    )
  );
}

function isPageCollection(collection: DeliveryCollection) {
  return (
    PAGE_COLLECTION_SLUGS.includes(collection.slug) ||
    collection.collection_type === 'pages' ||
    collection.collection_type === 'page'
  );
}

function pathSegments(pathname: string): string[] | null {
  const segments: string[] = [];
  for (const raw of pathname.split('/')) {
    if (!raw) continue;
    let decoded: string;
    try {
      decoded = decodeURIComponent(raw);
    } catch {
      return null;
    }
    if (decoded.length > 200) return null;
    segments.push(decoded);
  }
  return segments;
}

/** Maps a request path onto the payload: `/`, `/:slug`, `/:collection`, `/:collection/:slug`. */
export function selectSitePage(
  payload: DeliveryPayload,
  pathname: string
): SitePage | null {
  const segments = pathSegments(pathname);
  if (!segments || segments.length > 2) return null;
  const pageCollections = payload.collections.filter(isPageCollection);
  const ordered = [
    ...pageCollections,
    ...payload.collections.filter((c) => !isPageCollection(c)),
  ];

  if (segments.length === 0) {
    for (const slug of HOME_SLUGS) {
      for (const collection of ordered) {
        const entry = collection.entries.find((item) => item.slug === slug);
        if (entry) return { kind: 'entry', collection, entry };
      }
    }
    return { kind: 'index' };
  }

  const [first, second] = segments as [string, string | undefined];
  if (second !== undefined) {
    const collection = payload.collections.find((c) => c.slug === first);
    const entry = collection?.entries.find((item) => item.slug === second);
    return collection && entry ? { kind: 'entry', collection, entry } : null;
  }

  for (const collection of pageCollections) {
    const entry = collection.entries.find((item) => item.slug === first);
    if (entry) return { kind: 'entry', collection, entry };
  }
  const collection = payload.collections.find((c) => c.slug === first);
  if (collection) return { kind: 'collection', collection };
  for (const candidate of ordered) {
    const entry = candidate.entries.find((item) => item.slug === first);
    if (entry) return { kind: 'entry', collection: candidate, entry };
  }
  return null;
}

function plainText(value: string, key: string): ReactNode {
  return value
    .split(/\n{2,}/u)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph, index) => <p key={`${key}-${index}`}>{paragraph}</p>);
}

function textField(content: unknown): string | null {
  if (typeof content === 'string') return content;
  if (!content || typeof content !== 'object') return null;
  const record = content as Record<string, unknown>;
  for (const field of ['markdown', 'text', 'body']) {
    if (typeof record[field] === 'string') return record[field] as string;
  }
  return null;
}

/** Renders one stored block: CMS page, CMS block, TipTap doc, or plain text. */
export function renderDeliveryBlock(block: DeliveryBlock): ReactNode {
  const page = cmsPageSchema.safeParse(block.content);
  if (page.success) {
    return <CmsPageRenderer key={block.id} page={page.data} />;
  }
  const cmsBlock = cmsBlockSchema.safeParse(block.content);
  if (cmsBlock.success) return renderCmsBlock(cmsBlock.data);
  const doc = tipTapDocSchema.safeParse(block.content);
  if (doc.success) {
    return <TipTapContent doc={doc.data} key={block.id} />;
  }
  const text = textField(block.content);
  return text ? (
    <div className="cms-richtext" key={block.id}>
      {plainText(text, block.id)}
    </div>
  ) : null;
}

function EntryView({ entry }: { entry: DeliveryEntry }) {
  const blocks = [...entry.blocks].sort((a, b) => a.sort_order - b.sort_order);
  const rendered = blocks.map(renderDeliveryBlock).filter(Boolean);
  const hasOwnPage = blocks.some(
    (block) => cmsPageSchema.safeParse(block.content).success
  );
  const images = [...entry.assets]
    .sort((a, b) => a.sort_order - b.sort_order)
    .filter(
      (asset) =>
        asset.asset_type === 'image' && safeUrl(asset.assetUrl ?? undefined)
    );
  return (
    <article>
      {hasOwnPage ? null : (
        <header>
          <h1>{entry.title}</h1>
          {entry.subtitle ? <p>{entry.subtitle}</p> : null}
          {entry.summary && rendered.length === 0 ? (
            <p>{entry.summary}</p>
          ) : null}
        </header>
      )}
      {rendered}
      {rendered.length === 0
        ? images.map((asset) => (
            <figure className="cms-image" key={asset.id}>
              <img
                alt={asset.alt_text ?? ''}
                loading="lazy"
                src={safeUrl(asset.assetUrl ?? undefined)}
              />
            </figure>
          ))
        : null}
    </article>
  );
}

function entryHref(collection: DeliveryCollection, entry: DeliveryEntry) {
  return isPageCollection(collection)
    ? `/${encodeURIComponent(entry.slug)}`
    : `/${encodeURIComponent(collection.slug)}/${encodeURIComponent(entry.slug)}`;
}

function CollectionView({ collection }: { collection: DeliveryCollection }) {
  return (
    <section>
      <h2>
        <a href={`/${encodeURIComponent(collection.slug)}`}>
          {collection.title}
        </a>
      </h2>
      {collection.description ? <p>{collection.description}</p> : null}
      <ul>
        {collection.entries.map((entry) => (
          <li key={entry.id}>
            <a href={entryHref(collection, entry)}>{entry.title}</a>
            {entry.summary ? <> · {entry.summary}</> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function pageTitle(workspace: ResolvedWorkspace, page: SitePage) {
  if (page.kind === 'entry') return `${page.entry.title} · ${workspace.name}`;
  if (page.kind === 'collection') {
    return `${page.collection.title} · ${workspace.name}`;
  }
  return workspace.name;
}

/** Full HTML document for a selected site page. Rendered without scripts. */
export function SiteDocument({
  page,
  payload,
  workspace,
}: {
  page: SitePage;
  payload: DeliveryPayload;
  workspace: ResolvedWorkspace;
}) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta content="width=device-width, initial-scale=1" name="viewport" />
        <title>{pageTitle(workspace, page)}</title>
        <style>{BASE_STYLES}</style>
      </head>
      <body>
        <div className="site">
          <nav>
            <a href="/">{workspace.name}</a>
          </nav>
          {page.kind === 'entry' ? <EntryView entry={page.entry} /> : null}
          {page.kind === 'collection' ? (
            <CollectionView collection={page.collection} />
          ) : null}
          {page.kind === 'index' ? (
            <>
              <h1>{workspace.name}</h1>
              {payload.collections
                .filter((collection) => collection.entries.length > 0)
                .map((collection) => (
                  <CollectionView collection={collection} key={collection.id} />
                ))}
            </>
          ) : null}
          <footer className="site-footer">
            Powered by{' '}
            <a href={POWERED_BY_URL} rel="noopener">
              Tuturuuu
            </a>
          </footer>
        </div>
      </body>
    </html>
  );
}
