import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { CmsPageRenderer } from '@tuturuuu/cms-blocks/render';
import { currentPage } from '../context.server';
const loadPage = createServerFn({ method: 'GET' }).handler(() => currentPage());
export const Route = createFileRoute('/$')({
  loader: () => loadPage(),
  head: ({ loaderData }) => ({ meta: [{ title: loaderData?.title ?? '' }, { name: 'description', content: loaderData?.description ?? '' }, { property: 'og:title', content: loaderData?.title ?? '' }, { property: 'og:description', content: loaderData?.description ?? '' }, { property: 'og:image', content: loaderData?.ogImage ?? '' }] }),
  component: Page,
});
function Page() {
  const { page, tokens, locale } = Route.useLoaderData();
  return <div lang={locale} style={{ color: tokens.foreground, backgroundColor: tokens.background, fontFamily: tokens.font }}><CmsPageRenderer page={page} /></div>;
}
