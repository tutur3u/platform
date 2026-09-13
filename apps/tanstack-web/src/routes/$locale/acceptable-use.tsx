import { createFileRoute } from '@tanstack/react-router';
import { getLegalDocument } from '@tuturuuu/legal';
import { toLegalPageConfig } from '../../components/legal/canonical-legal-config';
import { LegalPageLayout } from '../../components/legal/legal-page-layout';
import { createPageHead } from '../../lib/platform/head';

export const Route = createFileRoute('/$locale/acceptable-use')({
  component: AcceptableUsePage,
  head: () =>
    createPageHead({
      description:
        'Acceptable Use Policy governing Tuturuuu workspaces, applications, APIs, integrations, billing, and AI products.',
      title: 'Acceptable Use Policy',
    }),
});

function AcceptableUsePage() {
  const { locale } = Route.useParams();
  return (
    <LegalPageLayout
      config={toLegalPageConfig(getLegalDocument('acceptable-use', locale))}
    />
  );
}
