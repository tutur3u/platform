import { createFileRoute } from '@tanstack/react-router';
import { getComponentDoc } from '../../../../components/ui-docs/component-docs';
import { UiDocsComponentPage } from '../../../../components/ui-docs/ui-docs-component-page';
import { UiDocsRouteShell } from '../../../../components/ui-docs/ui-docs-route-shell';
import { resolveUiDocsLocale } from '../../../../data/ui-docs/messages';
import { createPageHead } from '../../../../lib/platform/head';

export const Route = createFileRoute('/$locale/ui/components/$componentId')({
  component: UiDocsComponentRoute,
  head: ({ params }) => {
    const { componentId, locale: rawLocale } = params as {
      componentId?: string;
      locale?: string;
    };
    const locale = resolveUiDocsLocale(rawLocale);
    const doc = componentId ? getComponentDoc(componentId) : undefined;

    return createPageHead({
      canonicalUrl: doc
        ? `https://tuturuuu.com/${locale}/ui/components/${doc.slug}`
        : `https://tuturuuu.com/${locale}/ui/components`,
      description: doc
        ? `Install and use ${doc.name} from ${doc.importPath}.`
        : 'Browse Tuturuuu UI components by category, import path, and live preview.',
      title: doc ? `${doc.name} - Tuturuuu UI` : 'Tuturuuu UI Components',
    });
  },
});

function UiDocsComponentRoute() {
  const { componentId, locale } = Route.useParams() as {
    componentId?: string;
    locale?: string;
  };
  const normalizedLocale = resolveUiDocsLocale(locale);

  return (
    <UiDocsRouteShell locale={normalizedLocale}>
      <UiDocsComponentPage
        componentId={componentId ?? ''}
        locale={normalizedLocale}
      />
    </UiDocsRouteShell>
  );
}
