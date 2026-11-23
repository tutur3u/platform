import type { Metadata } from 'next';
import type { MeetSeo } from './metadata';

export function meetSeoToNextMetadata(seo: MeetSeo): Metadata {
  const { openGraph } = seo;
  return {
    title: seo.title,
    description: seo.description,
    alternates: { canonical: seo.canonical, languages: seo.languages },
    robots: {
      index: seo.indexable,
      follow: seo.indexable,
      googleBot: { index: seo.indexable, follow: seo.indexable },
    },
    openGraph: {
      title: openGraph.title,
      description: openGraph.description,
      url: openGraph.url,
      siteName: openGraph.siteName,
      type: openGraph.type,
      locale: openGraph.locale,
      images: [openGraph.image],
    },
    twitter: {
      card: 'summary_large_image',
      title: openGraph.title,
      description: openGraph.description,
      images: [openGraph.image.url],
    },
  };
}
