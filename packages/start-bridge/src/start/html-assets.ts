import { prefixBase } from '../core/base-path';
import { METADATA_RESOURCE_SELECTOR } from '../core/metadata-assets';

type Element = {
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
};

type Rewriter = {
  on(selector: string, handler: { element(element: Element): void }): Rewriter;
  transform(response: Response): Response;
};

declare const HTMLRewriter: new () => Rewriter;

const RESOURCE_LINKS = new Set([
  'apple-touch-icon',
  'apple-touch-icon-precomposed',
  'icon',
  'manifest',
  'mask-icon',
  'modulepreload',
  'prefetch',
  'preload',
  'stylesheet',
]);

/** Scope rendered assets to the admitted mount, including CSS and module
 * hints emitted by React outside the Start route manifest. */
export function prefixHtmlAssets(
  response: Response,
  requestUrl: URL,
  basePath: string,
  publicAssets: ReadonlySet<string>
): Response {
  if (
    !basePath ||
    !response.body ||
    response.headers.get('content-type')?.split(';', 1)[0]?.trim() !==
      'text/html' ||
    typeof HTMLRewriter === 'undefined'
  )
    return response;

  const rewrite = (element: Element, attribute: string) => {
    const value = element.getAttribute(attribute);
    if (!value || value.startsWith('#') || value.startsWith('//')) return;
    let url: URL;
    try {
      url = new URL(value, requestUrl);
    } catch {
      return;
    }
    if (url.origin !== requestUrl.origin) return;
    if (!url.pathname.startsWith('/assets/') && !publicAssets.has(url.pathname))
      return;
    element.setAttribute(
      attribute,
      prefixBase(`${url.pathname}${url.search}${url.hash}`, basePath)
    );
  };

  return new HTMLRewriter()
    .on('link[href]', {
      element(element) {
        const rel = element.getAttribute('rel')?.toLowerCase().split(/\s+/u);
        if (rel?.some((token) => RESOURCE_LINKS.has(token)))
          rewrite(element, 'href');
        rewrite(element, 'data-rsc-css-href');
      },
    })
    .on(
      'script[src], img[src], source[src], audio[src], video[src], track[src], embed[src], input[src], iframe[src]',
      {
        element: (element) => rewrite(element, 'src'),
      }
    )
    .on('image[href], use[href]', {
      element: (element) => rewrite(element, 'href'),
    })
    .on(METADATA_RESOURCE_SELECTOR, {
      element: (element) => rewrite(element, 'content'),
    })
    .on('video[poster]', { element: (element) => rewrite(element, 'poster') })
    .on('object[data]', { element: (element) => rewrite(element, 'data') })
    .transform(response);
}
