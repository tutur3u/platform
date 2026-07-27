import { createFileRoute } from '@tanstack/react-router';
import { getLegalDocument } from '@tuturuuu/legal';
import { toLegalPageConfig } from '../../components/legal/canonical-legal-config';
import { LegalPageLayout } from '../../components/legal/legal-page-layout';
import { createPageHead } from '../../lib/platform/head';

export const Route = createFileRoute('/$locale/terms')({
  component: TermsPage,
  head: () =>
    createPageHead({
      description:
        'Terms of Service governing Tuturuuu workspaces, applications, APIs, integrations, billing, and AI products.',
      title: 'Terms of Service',
    }),
});

function TermsPage() {
  const { locale } = Route.useParams();
  return (
    <LegalPageLayout
      config={toLegalPageConfig(getLegalDocument('terms', locale))}
    />
  );
}
