import {
  createPageMetadata,
  createSiteTitle,
  TUTURUUU_URL,
} from '@tuturuuu/utils/common/page-metadata';

export function publicHead(
  copy: { title: string; description: string },
  slug: string,
  locale: 'en' | 'vi'
) {
  const metadata = createPageMetadata({
    ...copy,
    baseUrl: TUTURUUU_URL,
    locale,
    pathname: `/${slug}`,
    localePrefix: 'as-needed',
  });
  const og = metadata.openGraph;
  const twitter = metadata.twitter;
  return {
    meta: [
      {
        title: createSiteTitle(og.siteName).template.replace(
          '%s',
          metadata.title
        ),
      },
      { name: 'description', content: metadata.description },
      { property: 'og:type', content: og.type },
      { property: 'og:url', content: og.url },
      { property: 'og:locale', content: og.locale },
      ...og.alternateLocale.map((content) => ({
        property: 'og:locale:alternate',
        content,
      })),
      { property: 'og:site_name', content: og.siteName },
      { property: 'og:title', content: og.title },
      { property: 'og:description', content: og.description },
      ...og.images.flatMap((image) => [
        { property: 'og:image', content: image.url },
        { property: 'og:image:width', content: String(image.width) },
        { property: 'og:image:height', content: String(image.height) },
        { property: 'og:image:alt', content: image.alt },
      ]),
      { name: 'twitter:card', content: twitter.card },
      { name: 'twitter:title', content: twitter.title },
      { name: 'twitter:description', content: twitter.description },
      ...twitter.images.map((content) => ({ name: 'twitter:image', content })),
      { name: 'twitter:creator', content: twitter.creator },
      { name: 'twitter:site', content: twitter.site },
    ],
    links: [
      { rel: 'canonical', href: metadata.alternates.canonical },
      ...Object.entries(metadata.alternates.languages ?? {}).map(
        ([hrefLang, href]) => ({
          rel: 'alternate',
          hrefLang,
          href,
        })
      ),
    ],
  };
}
