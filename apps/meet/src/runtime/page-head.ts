import { fontPreloads } from './font-preloads';
import { localeMessagesPreload } from './locale-messages';

export interface MeetPageMeta {
  title: string;
  description: string;
  indexable: boolean;
  canonical: string;
  image?: string;
}

export function pageHead({
  meta,
  locale,
}: {
  meta: MeetPageMeta;
  locale: string;
}) {
  return {
    meta: [
      { title: meta.title },
      { name: 'description', content: meta.description },
      {
        name: 'robots',
        content: meta.indexable ? 'index,follow' : 'noindex,nofollow',
      },
      { property: 'og:title', content: meta.title },
      { property: 'og:description', content: meta.description },
      { property: 'og:url', content: meta.canonical },
      { property: 'og:site_name', content: 'Tuturuuu Meet' },
      { property: 'og:type', content: 'website' },
      { property: 'og:locale', content: locale === 'vi' ? 'vi_VN' : 'en_US' },
      { name: 'twitter:card', content: 'summary_large_image' },
      ...(meta.image
        ? [
            { property: 'og:image', content: meta.image },
            { name: 'twitter:image', content: meta.image },
          ]
        : []),
    ],
    links: [
      { rel: 'canonical', href: meta.canonical },
      localeMessagesPreload(locale),
      ...fontPreloads(locale),
    ],
  };
}
