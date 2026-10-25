import { isNotFound, notFound } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { metadataToHead, renderAppRouterPage } from './page-route';

const render = vi.fn(async (element: ReactNode) =>
  renderToStaticMarkup(element)
);

const rootLayout = {
  metadata: { title: { default: 'Contacts', template: '%s | Contacts' } },
  default: async ({ children }: { children: ReactNode }) => (
    <div data-layout="root">{children}</div>
  ),
};
const wsLayout = {
  default: async ({
    children,
    params,
  }: {
    children: ReactNode;
    params: Promise<{ wsId: string }>;
  }) => <section data-ws={(await params).wsId}>{children}</section>,
};
const page = {
  generateMetadata: async (
    { params }: { params: Promise<{ wsId: string }> },
    parent: Promise<{ title?: unknown }>
  ) => {
    expect((await parent).title).toEqual({
      default: 'Contacts',
      template: '%s | Contacts',
    });
    return {
      title: `People ${(await params).wsId}`,
      description: 'People list',
      alternates: { canonical: 'https://tuturuuu.com/contacts/people' },
      robots: { index: false, follow: true },
    };
  },
  default: async ({
    params,
    searchParams,
  }: {
    params: Promise<{ wsId: string }>;
    searchParams: Promise<{ q?: string }>;
  }) => {
    const { wsId } = await params;
    if (wsId === 'missing') throw notFound();
    return (
      <main>
        {wsId}:{(await searchParams).q}
      </main>
    );
  },
};

describe('App Router page rendering', () => {
  it('awaits the page and layouts root-down and maps metadata with templates', async () => {
    const result = await renderAppRouterPage({
      page: async () => page as never,
      layouts: [async () => rootLayout as never, async () => wsLayout as never],
      params: { wsId: 'ws1' },
      searchParams: { q: 'an' },
      render,
    });
    expect(result.node).toBe(
      '<div data-layout="root"><section data-ws="ws1"><main>ws1:an</main></section></div>'
    );
    expect(result.head).toEqual({
      meta: [
        { title: 'People ws1 | Contacts' },
        { name: 'description', content: 'People list' },
        { name: 'robots', content: 'noindex, follow' },
      ],
      links: [
        { rel: 'canonical', href: 'https://tuturuuu.com/contacts/people' },
      ],
    });
  });

  it('propagates notFound from the page body before streaming', async () => {
    render.mockClear();
    const error = await renderAppRouterPage({
      page: async () => page as never,
      layouts: [async () => rootLayout as never],
      params: { wsId: 'missing' },
      render,
    }).catch((caught: unknown) => caught);
    expect(isNotFound(error)).toBe(true);
    expect(render).not.toHaveBeenCalled();
  });

  it('maps absolute titles, open graph and other tags', () => {
    expect(
      metadataToHead([
        { title: { template: '%s | X' } },
        {
          title: { absolute: 'Exact' },
          openGraph: { title: 'OG', url: new URL('https://x.test/a') },
          other: { 'theme-color': ['#fff', '#000'] },
        },
      ]).meta
    ).toEqual([
      { title: 'Exact' },
      { property: 'og:title', content: 'OG' },
      { property: 'og:url', content: 'https://x.test/a' },
      { name: 'theme-color', content: '#fff' },
      { name: 'theme-color', content: '#000' },
    ]);
  });
});
