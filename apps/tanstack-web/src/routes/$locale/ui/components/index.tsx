import { createFileRoute } from '@tanstack/react-router';
import { UiDocsComponentsPage } from '../../../../components/ui-docs/ui-docs-components-page';
import { UiDocsRouteShell } from '../../../../components/ui-docs/ui-docs-route-shell';
import { resolveUiDocsLocale } from '../../../../data/ui-docs/messages';
import { createPageHead } from '../../../../lib/platform/head';

export const Route = createFileRoute('/$locale/ui/components/')({
  component: UiDocsComponentsRoute,
  head: ({ params }) => {
    const { locale: rawLocale } = params as { locale?: string };
    const locale = resolveUiDocsLocale(rawLocale);
    return createPageHead({
      canonicalUrl: `https://tuturuuu.com/${locale}/ui/components`,
      description:
        'Browse Tuturuuu UI components by category, import path, and live preview.',
      title: 'Tuturuuu UI Components',
    });
  },
});

function UiDocsComponentsRoute() {
  const { locale } = Route.useParams() as { locale?: string };
  const normalizedLocale = resolveUiDocsLocale(locale);

  return (
    <UiDocsRouteShell locale={normalizedLocale}>
      <UiDocsComponentsPage locale={normalizedLocale} />
    </UiDocsRouteShell>
  );
}
