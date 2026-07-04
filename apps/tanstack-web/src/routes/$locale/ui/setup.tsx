import { createFileRoute } from '@tanstack/react-router';
import { UiDocsRouteShell } from '../../../components/ui-docs/ui-docs-route-shell';
import { UiDocsSetupPage } from '../../../components/ui-docs/ui-docs-setup-page';
import { resolveUiDocsLocale } from '../../../data/ui-docs/messages';
import { createPageHead } from '../../../lib/platform/head';

export const Route = createFileRoute('/$locale/ui/setup')({
  component: UiDocsSetupRoute,
  head: ({ params }) => {
    const { locale: rawLocale } = params as { locale?: string };
    const locale = resolveUiDocsLocale(rawLocale);
    return createPageHead({
      canonicalUrl: `https://tuturuuu.com/${locale}/ui/setup`,
      description:
        'Install Tuturuuu UI, wire shared styles, and follow contributor setup steps.',
      title: 'Tuturuuu UI Setup',
    });
  },
});

function UiDocsSetupRoute() {
  const { locale } = Route.useParams() as { locale?: string };

  return (
    <UiDocsRouteShell locale={locale}>
      <UiDocsSetupPage />
    </UiDocsRouteShell>
  );
}
