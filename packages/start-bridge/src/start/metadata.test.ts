import { describe, expect, it } from 'vitest';
import { resolveMetadata, resolveViewport, toHead } from './metadata';

const props = {
  params: Promise.resolve({ locale: 'en' }),
  searchParams: Promise.resolve({}),
};

describe('metadata', () => {
  it('applies the nearest title template and shallow-merges segments', async () => {
    const metadata = await resolveMetadata(
      [
        {
          metadata: {
            title: { default: 'Tools', template: '%s | Tools' },
            description: 'root',
            robots: { index: false, follow: true },
          },
        },
        {
          generateMetadata: async (
            { params }: { params: Promise<unknown> },
            parent: Promise<{ description?: string }>
          ) => {
            expect(await params).toEqual({ locale: 'en' });
            expect((await parent).description).toBe('root');
            return { title: 'QR', alternates: { canonical: 'https://t/qr' } };
          },
        },
      ],
      props
    );
    expect(metadata.title).toBe('QR | Tools');
    expect(metadata.description).toBe('root');
    const head = toHead(metadata, await resolveViewport([], props.params));
    expect(head.meta).toContainEqual({ title: 'QR | Tools' });
    expect(head.meta).toContainEqual({
      name: 'robots',
      content: 'noindex, follow',
    });
    expect(head.links).toEqual([{ rel: 'canonical', href: 'https://t/qr' }]);
  });

  it('keeps a template default and absolute titles', async () => {
    const root = {
      metadata: { title: { default: 'Home', template: '%s - A' } },
    };
    expect((await resolveMetadata([root], props)).title).toBe('Home');
    expect(
      (
        await resolveMetadata(
          [root, { metadata: { title: { absolute: 'Raw' } } }],
          props
        )
      ).title
    ).toBe('Raw');
  });

  it('renders viewport, open graph, twitter and icons', async () => {
    const viewport = await resolveViewport(
      [
        {
          viewport: {
            themeColor: [
              { color: '#fff', media: '(prefers-color-scheme: light)' },
            ],
            maximumScale: 5,
          },
        },
      ],
      props.params
    );
    const head = toHead(
      {
        title: 'T',
        openGraph: { siteName: 'S', images: [{ url: 'https://i/og.jpg' }] },
        twitter: { card: 'summary' },
        icons: { icon: '/favicon.ico', apple: ['/apple.png'] },
      },
      viewport
    );
    expect(head.meta).toContainEqual({
      name: 'viewport',
      content: 'width=device-width, initial-scale=1, maximum-scale=5',
    });
    expect(head.meta).toContainEqual({
      name: 'theme-color',
      content: '#fff',
      media: '(prefers-color-scheme: light)',
    });
    expect(head.meta).toContainEqual({
      property: 'og:site_name',
      content: 'S',
    });
    expect(head.meta).toContainEqual({
      property: 'og:image',
      content: 'https://i/og.jpg',
    });
    expect(head.meta).toContainEqual({
      name: 'twitter:card',
      content: 'summary',
    });
    expect(head.links).toEqual([
      { rel: 'icon', href: '/favicon.ico' },
      { rel: 'apple-touch-icon', href: '/apple.png' },
    ]);
  });

  it('maps robots objects, repeated other tags, og url and canonical', () => {
    const head = toHead(
      {
        title: 'T',
        robots: { index: false, follow: true },
        openGraph: { url: new URL('https://x.test/a') },
        other: { 'theme-color': ['#fff', '#000'] },
        alternates: { canonical: 'https://tuturuuu.com/contacts/people' },
      },
      {}
    );
    expect(head.meta).toContainEqual({
      name: 'robots',
      content: 'noindex, follow',
    });
    expect(head.meta).toContainEqual({
      property: 'og:url',
      content: 'https://x.test/a',
    });
    expect(
      head.meta
        .filter((tag) => tag.name === 'theme-color')
        .map((t) => t.content)
    ).toEqual(['#fff', '#000']);
    expect(head.links).toContainEqual({
      rel: 'canonical',
      href: 'https://tuturuuu.com/contacts/people',
    });
  });
});
