import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { CmsPageRenderer } from '@tuturuuu/cms-blocks/render';
import { currentPage } from '../context.server';

// TipTap attrs are Record<string, unknown>, which TanStack Start rejects as a
// server-function return. Cross the boundary as JSON and parse for the renderer.
const loadPage = createServerFn({ method: 'GET' }).handler(() => {
  const published = currentPage();
  return {
    pageJson: JSON.stringify(published.page),
    locale: published.locale,
    title: published.title,
    description: published.description ?? '',
    ogImage: published.ogImage ?? '',
    tokens: {
      foreground: published.tokens.foreground,
      background: published.tokens.background,
      font: published.tokens.font,
    },
  };
});

export const Route = createFileRoute('/$')({
  loader: () => loadPage(),
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData?.title ?? '' },
      { name: 'description', content: loaderData?.description ?? '' },
      { property: 'og:title', content: loaderData?.title ?? '' },
      { property: 'og:description', content: loaderData?.description ?? '' },
      { property: 'og:image', content: loaderData?.ogImage ?? '' },
    ],
  }),
  component: Page,
});

function Page() {
  const { pageJson, tokens, locale } = Route.useLoaderData();
  return (
    <div
      lang={locale}
      style={{
        color: tokens.foreground,
        backgroundColor: tokens.background,
        fontFamily: tokens.font,
      }}
    >
      <CmsPageRenderer page={JSON.parse(pageJson)} />
    </div>
  );
}
