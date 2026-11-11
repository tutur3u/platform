import { StatusPageDocument } from '@tuturuuu/ui/custom/status-page';
import { renderToStaticMarkup } from 'react-dom/server';
import { langFromPathname } from './seo.ts';

/**
 * The Worker's own 404 (paths the request boundary rejects before the router
 * runs): the shared Tuturuuu status page as a static document. No scripts, so
 * the hash-based CSP allows nothing extra and the theme comes from CSS.
 */
export function roadmapNotFoundResponse(request: Request): Response {
  const lang = langFromPathname(new URL(request.url).pathname);
  const html = `<!DOCTYPE html>${renderToStaticMarkup(
    <StatusPageDocument
      appHref={lang === 'vi' ? '/roadmap/vi' : '/roadmap'}
      appName="Roadmap"
      locale={lang}
      variant="not-found"
    />
  )}`;
  return new Response(request.method === 'HEAD' ? null : html, {
    status: 404,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}
