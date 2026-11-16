import logo from './assets/tuturuuu-logo.png?no-inline';

/**
 * The roadmap document's own head: viewport, theme colours, site-wide Open
 * Graph tags, the stylesheet and icons. Every app that renders the roadmap
 * (apps/roadmap's root route, the marketing app's roadmap routes) uses it,
 * with its own stylesheet entry: each app loads @tuturuuu/ui/globals.css from
 * its own src, then @tuturuuu/roadmap-core/styles.css.
 */
export function roadmapDocumentHead(stylesheet: string) {
  return {
    meta: [
      { charSet: 'utf-8' },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1, viewport-fit=cover',
      },
      {
        name: 'theme-color',
        content: '#0a0a0a',
        media: '(prefers-color-scheme: dark)',
      },
      {
        name: 'theme-color',
        content: '#fdf9f7',
        media: '(prefers-color-scheme: light)',
      },
      // Title, description, og:title/url, canonical and hreflang are per
      // page: each route sets its own, so no page claims another's URL.
      { property: 'og:type', content: 'website' },
      { property: 'og:site_name', content: 'Tuturuuu' },
    ],
    links: [
      { rel: 'stylesheet', href: stylesheet },
      { rel: 'icon', type: 'image/png', href: logo },
      { rel: 'apple-touch-icon', href: logo },
    ],
  };
}
