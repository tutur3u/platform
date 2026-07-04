import { createFileRoute } from '@tanstack/react-router';
import { UiDocsOverviewPage } from '../../../components/ui-docs/ui-docs-overview-page';
import { UiDocsRouteShell } from '../../../components/ui-docs/ui-docs-route-shell';
import { resolveUiDocsLocale } from '../../../data/ui-docs/messages';
import { createPageHead } from '../../../lib/platform/head';

export const Route = createFileRoute('/$locale/ui/')({
  component: UiDocsOverviewRoute,
  head: ({ params }) => {
    const { locale: rawLocale } = params as { locale?: string };
    const locale = resolveUiDocsLocale(rawLocale);
    return createPageHead({
      canonicalUrl: `https://tuturuuu.com/${locale}/ui`,
      description:
        'Explore the Tuturuuu UI component showcase, setup guide, and contribution patterns.',
      title: 'Tuturuuu UI',
    });
  },
});

function UiDocsOverviewRoute() {
  const { locale } = Route.useParams() as { locale?: string };
  const normalizedLocale = resolveUiDocsLocale(locale);

  return (
    <UiDocsRouteShell locale={normalizedLocale}>
      <UiDocsOverviewPage locale={normalizedLocale} />
    </UiDocsRouteShell>
  );
}
