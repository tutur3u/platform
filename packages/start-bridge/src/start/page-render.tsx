import type { ReactElement, ReactNode } from 'react';
import { runtimeAppBase } from '../core/app-url';
import { type BridgePage, matchPage } from '../core/pages';
import type { RouteParams } from '../core/route-match';
import {
  type BridgeHead,
  type MetadataModule,
  resolveMetadata,
  resolveViewport,
  toHead,
} from './metadata';
import { requestLocale, setPageParams } from './page-params';

/**
 * Generic App Router page rendering for the RSC environment: matches the
 * generated manifest, then renders the page inside its layout chain exactly as
 * Next would (Promise params/searchParams, merged metadata). Import only from
 * server-function handlers; it runs where server components can render.
 */

// App components declare their own props (`{ params: Promise<{ id }> }`), so
// the module type accepts any props; the adapter calls them with Next's.
// Redirect-only pages (`redirect()` in the body) return void, as in Next.
// biome-ignore lint/suspicious/noConfusingVoidType: `Promise<void>` page returns must type-check; `undefined` rejects them.
type Component = (props: never) => ReactNode | void | Promise<ReactNode | void>;
type Renderable = (
  props: Record<string, unknown>
) => ReactNode | Promise<ReactNode>;

export interface PageModule extends MetadataModule {
  default: Component;
}
export type LayoutModule = PageModule;

export interface BridgePageModules {
  page: () => Promise<PageModule>;
  /** Outermost first; includes `template.*` wrappers in chain order. */
  layouts: readonly (() => Promise<LayoutModule>)[];
}

export interface ResolvedBridgePage {
  status: 200;
  pattern: string;
  head: BridgeHead;
  /** Attributes of the root layout's `<html>` and `<body>`, if it renders them. */
  html: DocumentAttributes;
  body: DocumentAttributes;
  element: ReactElement;
}

export function searchParamsRecord(search: URLSearchParams) {
  const record: Record<string, string | string[]> = {};
  for (const [key, value] of search) {
    const previous = record[key];
    record[key] =
      previous === undefined
        ? value
        : Array.isArray(previous)
          ? [...previous, value]
          : [previous, value];
  }
  return record;
}

function isElement(
  node: unknown,
  type: string
): node is ReactElement<{
  children?: ReactNode;
  [key: string]: unknown;
}> {
  return (
    typeof node === 'object' &&
    node !== null &&
    'type' in node &&
    (node as { type: unknown }).type === type
  );
}

const FRAGMENT = Symbol.for('react.fragment');

/** Top-level nodes with fragments (any depth) expanded in order. */
export function flattenFragments(node: ReactNode): ReactNode[] {
  if (Array.isArray(node)) return node.flatMap(flattenFragments);
  if (
    typeof node === 'object' &&
    node !== null &&
    'type' in node &&
    (node as { type: unknown }).type === FRAGMENT
  )
    return flattenFragments(
      (node as { props: { children?: ReactNode } }).props.children
    );
  return node === null || node === undefined || node === false ? [] : [node];
}

const CLIENT_REFERENCE = Symbol.for('react.client.reference');

/**
 * Flattens fragments and renders server-component elements (never client
 * references) until host elements remain, so a wrapped root layout still
 * exposes its <html>. Bounded to a few levels of wrapping.
 */
export async function expandServerElements(
  node: ReactNode,
  depth = 0
): Promise<ReactNode[]> {
  const expanded: ReactNode[] = [];
  for (const item of flattenFragments(node)) {
    const type =
      typeof item === 'object' && item !== null && 'type' in item
        ? (item as { type: unknown }).type
        : undefined;
    if (
      depth < 4 &&
      typeof type === 'function' &&
      (type as { $$typeof?: symbol }).$$typeof !== CLIENT_REFERENCE
    ) {
      const props = (item as { props: Record<string, unknown> }).props;
      expanded.push(
        ...(await expandServerElements(
          await (type as Renderable)(props),
          depth + 1
        ))
      );
    } else expanded.push(item);
  }
  return expanded;
}

function isAsyncServerComponent(type: unknown): type is Renderable {
  return (
    typeof type === 'function' &&
    (type as { $$typeof?: symbol }).$$typeof !== CLIENT_REFERENCE &&
    Object.prototype.toString.call(type) === '[object AsyncFunction]'
  );
}

/**
 * Async pages and layouts are awaited before streaming so `notFound()` and
 * `redirect()` thrown in their bodies reach the router as a 404 or redirect
 * (once streaming starts they can only hit the error boundary). Sync server
 * components stay elements: they may call hooks (`use`), which need React's
 * render. Client references are never called.
 */
async function renderPageNode(
  type: unknown,
  props: Record<string, unknown>
): Promise<ReactNode> {
  if (isAsyncServerComponent(type)) return type(props);
  const Component = type as Renderable;
  return <Component {...props} />;
}

export type DocumentAttributes = Record<string, string | number | boolean>;

/** Serializable attributes of a root element (no children, styles or handlers). */
export function attributes(props: Record<string, unknown>): DocumentAttributes {
  const result: DocumentAttributes = {};
  for (const [key, value] of Object.entries(props))
    if (
      key !== 'children' &&
      (typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean')
    )
      result[key] = value;
  return result;
}

/**
 * Splits an app href into path and query on a fixed origin. The path is
 * assigned, never parsed as a URL reference, so `//host/x` stays a path.
 */
function appLocation(href: string) {
  const url = new URL('http://bridge.invalid');
  const end = href.search(/[?#]/u);
  url.pathname = end === -1 ? href : href.slice(0, end);
  if (end !== -1 && href[end] === '?')
    url.search = href.slice(end).split('#', 1)[0] ?? '';
  return url;
}

export interface ResolveBridgePageOptions<Page extends BridgePage> {
  /** App-relative pathname plus search, e.g. `/qr?x=1`. */
  href: string;
  pages: readonly Page[];
  modules: Readonly<Record<Page['file'], BridgePageModules>>;
  locales?: readonly string[];
  defaultLocale?: string;
}

/** Returns `null` when no page matches (the caller answers 404). */
export async function resolveBridgePage<Page extends BridgePage>(
  options: ResolveBridgePageOptions<Page>
): Promise<ResolvedBridgePage | null> {
  const url = appLocation(options.href);
  // Router locations may carry the mount (`/tools/qr`); match app-relative.
  const base = runtimeAppBase();
  const pathname =
    base && (url.pathname === base || url.pathname.startsWith(`${base}/`))
      ? url.pathname.slice(base.length) || '/'
      : url.pathname;
  const locales = options.locales ?? ['en', 'vi'];
  let match = matchPage(options.pages, pathname);
  // A rewritten location (`/en/x`, the next-intl rewrite) addresses a
  // manifest whose `[locale]` segment is stripped: the prefix is the locale.
  // It wins over a dynamic segment that would capture the locale (`/en` is
  // the landing page, not workspace `en`); a page whose first segment is
  // literally the prefix still wins.
  let prefixLocale: string | undefined;
  const [, first, ...rest] = pathname.split('/');
  if (
    first &&
    locales.includes(first) &&
    match?.page.pattern.split('/')[1] !== first
  ) {
    const stripped = matchPage(options.pages, `/${rest.join('/')}`);
    if (stripped?.page.defaults && 'locale' in stripped.page.defaults) {
      match = stripped;
      prefixLocale = first;
    }
  }
  if (!match) return null;
  const entry = options.modules[match.page.file as Page['file']];
  if (!entry) throw new Error(`No modules for page ${match.page.file}`);
  const params: RouteParams = { ...match.params };
  if (match.page.defaults && 'locale' in match.page.defaults)
    params.locale =
      prefixLocale ??
      requestLocale(
        locales,
        options.defaultLocale ?? match.page.defaults.locale ?? 'en'
      );
  setPageParams(params);
  const [page, ...layouts] = await Promise.all([
    entry.page(),
    ...entry.layouts.map((load) => load()),
  ]);
  const chain = [...layouts, page];
  const searchParams = searchParamsRecord(url.searchParams);
  const props = {
    params: Promise.resolve(params),
    searchParams: Promise.resolve(searchParams),
  };
  const [metadata, viewport] = await Promise.all([
    resolveMetadata(chain, props),
    resolveViewport(chain, props.params),
  ]);
  let element: ReactNode = await renderPageNode(page.default, {
    params: props.params,
    searchParams: props.searchParams,
  });
  for (const layout of layouts.slice(1).reverse())
    element = await renderPageNode(layout.default, {
      params: props.params,
      children: element,
    });
  let html: DocumentAttributes = {};
  let body: DocumentAttributes = {};
  const root = layouts[0];
  if (root) {
    // The root layout owns <html>/<body>; Start's shell renders those, so the
    // root's attributes are lifted and only its body content is kept.
    const rendered = await (root.default as Renderable)({
      params: props.params,
      children: element,
    });
    // RSC CSS injection wraps the return in a fragment with stylesheet links;
    // those are kept (React hoists them) while <html>/<body> are lifted.
    const nodes = await expandServerElements(rendered);
    const htmlNode = nodes.find((node) => isElement(node, 'html'));
    if (isElement(htmlNode, 'html')) {
      html = attributes(htmlNode.props);
      const extras = nodes.filter((node) => node !== htmlNode);
      const inner = flattenFragments(htmlNode.props.children);
      const bodyNode = inner.find((node) => isElement(node, 'body'));
      if (isElement(bodyNode, 'body')) {
        body = attributes(bodyNode.props);
        element = (
          <>
            {extras}
            {inner.filter(
              (node) => node !== bodyNode && !isElement(node, 'head')
            )}
            {bodyNode.props.children}
          </>
        );
      } else
        element = (
          <>
            {extras}
            {inner}
          </>
        );
    } else element = rendered;
  }
  return {
    status: 200,
    pattern: match.page.pattern,
    head: toHead(metadata, viewport),
    html,
    body,
    element: element as ReactElement,
  };
}
