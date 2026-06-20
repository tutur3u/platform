import type { Locale } from './locale';

export type HeadMetaDescriptor = {
  charSet?: string;
  content?: string;
  name?: string;
  property?: string;
  title?: string;
};

export type HeadLinkDescriptor = {
  href: string;
  hrefLang?: string;
  rel: string;
};

export type PageHeadInput = {
  canonicalUrl?: string;
  description?: string;
  imageUrl?: string;
  locale?: Locale;
  robots?: string;
  title: string;
};

export type PageHeadOptions = {
  alternates?: Partial<Record<Locale, string>>;
  links?: HeadLinkDescriptor[];
  meta?: HeadMetaDescriptor[];
  stylesheets?: string[];
};

export function createPageHead(
  input: PageHeadInput,
  options: PageHeadOptions = {}
) {
  const meta: HeadMetaDescriptor[] = [
    { charSet: 'utf-8' },
    {
      content: 'width=device-width, initial-scale=1',
      name: 'viewport',
    },
    { title: input.title },
    { content: input.title, property: 'og:title' },
  ];

  if (input.description) {
    meta.push(
      { content: input.description, name: 'description' },
      { content: input.description, property: 'og:description' }
    );
  }

  if (input.imageUrl) {
    meta.push({ content: input.imageUrl, property: 'og:image' });
  }

  if (input.locale) {
    meta.push({ content: input.locale, property: 'og:locale' });
  }

  if (input.robots) {
    meta.push({ content: input.robots, name: 'robots' });
  }

  const links: HeadLinkDescriptor[] = [
    ...(options.stylesheets ?? []).map((href) => ({ href, rel: 'stylesheet' })),
    ...(input.canonicalUrl
      ? [{ href: input.canonicalUrl, rel: 'canonical' }]
      : []),
    ...Object.entries(options.alternates ?? {}).map(([locale, href]) => ({
      href,
      hrefLang: locale,
      rel: 'alternate',
    })),
    ...(options.links ?? []),
  ];

  return {
    links,
    meta: [...meta, ...(options.meta ?? [])],
  };
}
