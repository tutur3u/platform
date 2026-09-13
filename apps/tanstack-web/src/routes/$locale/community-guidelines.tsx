import { createFileRoute } from '@tanstack/react-router';
import { getLegalDocument } from '@tuturuuu/legal';
import { toLegalPageConfig } from '../../components/legal/canonical-legal-config';
import { LegalPageLayout } from '../../components/legal/legal-page-layout';
import { createPageHead } from '../../lib/platform/head';

export const Route = createFileRoute('/$locale/community-guidelines')({
  component: CommunityGuidelinesPage,
  head: () =>
    createPageHead({
      description:
        'Community Guidelines governing Tuturuuu workspaces, applications, APIs, integrations, billing, and AI products.',
      title: 'Community Guidelines',
    }),
});

function CommunityGuidelinesPage() {
  const { locale } = Route.useParams();
  return (
    <LegalPageLayout
      config={toLegalPageConfig(
        getLegalDocument('community-guidelines', locale)
      )}
    />
  );
}
