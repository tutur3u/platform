import { siteConfig } from '@/constants/configs';
import { getPublicLocalizedPath } from './public-routes';

export function serializeStructuredData(value: unknown) {
  // JSON-LD is embedded in HTML: escape script terminators in translated copy.
  const serialized = JSON.stringify(value);
  if (serialized === undefined)
    throw new Error('Structured data must be JSON serializable.');
  return serialized.replace(/</g, '\\u003c');
}

export function createHomepageStructuredData({
  locale,
  title,
  description,
}: {
  locale: 'en' | 'vi';
  title: string;
  description: string;
}) {
  const home = new URL('/', siteConfig.url).toString();
  const url = new URL(
    getPublicLocalizedPath('/', locale),
    siteConfig.url
  ).toString();
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${home}#organization`,
        name: siteConfig.name,
        url: home,
        logo: new URL('/media/logos/transparent.png', home).toString(),
        sameAs: [siteConfig.links.github, siteConfig.links.twitter],
      },
      {
        '@type': 'WebSite',
        '@id': `${home}#website`,
        name: siteConfig.name,
        url: home,
        inLanguage: ['en-US', 'vi-VN'],
        publisher: { '@id': `${home}#organization` },
      },
      {
        '@type': 'WebPage',
        '@id': `${url}#webpage`,
        url,
        name: title,
        description,
        inLanguage: locale === 'vi' ? 'vi-VN' : 'en-US',
        isPartOf: { '@id': `${home}#website` },
        about: { '@id': `${home}#application` },
      },
      {
        '@type': 'WebApplication',
        '@id': `${home}#application`,
        name: siteConfig.name,
        url: home,
        description,
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        publisher: { '@id': `${home}#organization` },
      },
    ],
  };
}
