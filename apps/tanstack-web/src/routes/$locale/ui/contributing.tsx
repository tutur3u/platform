import { createFileRoute } from '@tanstack/react-router';
import { UiDocsContributingPage } from '../../../components/ui-docs/ui-docs-contributing-page';
import { UiDocsRouteShell } from '../../../components/ui-docs/ui-docs-route-shell';
import { resolveUiDocsLocale } from '../../../data/ui-docs/messages';
import { createPageHead } from '../../../lib/platform/head';

export const Route = createFileRoute('/$locale/ui/contributing')({
  component: UiDocsContributingRoute,
  head: ({ params }) => {
    const { locale: rawLocale } = params as { locale?: string };
    const locale = resolveUiDocsLocale(rawLocale);
    return createPageHead({
      canonicalUrl: `https://tuturuuu.com/${locale}/ui/contributing`,
      description:
        'Follow the Tuturuuu UI contribution workflow for registry entries, previews, docs, and validation.',
      title: 'Contributing to Tuturuuu UI',
    });
  },
});

function UiDocsContributingRoute() {
  const { locale } = Route.useParams() as { locale?: string };

  return (
    <UiDocsRouteShell locale={locale}>
      <UiDocsContributingPage />
    </UiDocsRouteShell>
  );
}
