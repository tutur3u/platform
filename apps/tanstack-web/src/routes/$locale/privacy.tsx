import { createFileRoute } from '@tanstack/react-router';
import { getLegalDocument } from '@tuturuuu/legal';
import { toLegalPageConfig } from '../../components/legal/canonical-legal-config';
import { LegalPageLayout } from '../../components/legal/legal-page-layout';
import { createPageHead } from '../../lib/platform/head';

export const Route = createFileRoute('/$locale/privacy')({
  component: PrivacyPage,
  head: () =>
    createPageHead({
      description:
        'Privacy Policy for Tuturuuu services, including workspace collaboration, commerce, integrations, and AI processing.',
      title: 'Privacy Policy',
    }),
});

function PrivacyPage() {
  const { locale } = Route.useParams();
  return (
    <LegalPageLayout
      config={toLegalPageConfig(getLegalDocument('privacy', locale))}
    />
  );
}
