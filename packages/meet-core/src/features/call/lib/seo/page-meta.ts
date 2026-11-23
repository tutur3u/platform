import type { MeetSeo } from './metadata';

/** Head tags for the native Start runtime, mirroring the Next metadata object. */
export function meetSeoToHeadMeta(seo: MeetSeo) {
  const { openGraph } = seo;
  return {
    meta: [
      { title: seo.title },
      { name: 'description', content: seo.description },
      {
        name: 'robots',
        content: seo.indexable
          ? 'index,follow,max-image-preview:large'
          : 'noindex,nofollow',
      },
      { property: 'og:title', content: openGraph.title },
      { property: 'og:description', content: openGraph.description },
      { property: 'og:url', content: openGraph.url },
      { property: 'og:site_name', content: openGraph.siteName },
      { property: 'og:type', content: openGraph.type },
      { property: 'og:locale', content: openGraph.locale },
      { property: 'og:image', content: openGraph.image.url },
      { property: 'og:image:width', content: String(openGraph.image.width) },
      { property: 'og:image:height', content: String(openGraph.image.height) },
      { property: 'og:image:alt', content: openGraph.image.alt },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: openGraph.title },
      { name: 'twitter:description', content: openGraph.description },
      { name: 'twitter:image', content: openGraph.image.url },
    ],
    links: [
      { rel: 'canonical', href: seo.canonical },
      ...Object.entries(seo.languages).map(([hreflang, href]) => ({
        rel: 'alternate',
        hreflang,
        href,
      })),
    ],
  };
}
