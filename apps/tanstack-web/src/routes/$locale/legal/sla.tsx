import { createFileRoute } from '@tanstack/react-router';
import { getLegalDocument } from '@tuturuuu/legal';
import { toLegalPageConfig } from '../../../components/legal/canonical-legal-config';
import { LegalPageLayout } from '../../../components/legal/legal-page-layout';
import { createPageHead } from '../../../lib/platform/head';

export const Route = createFileRoute('/$locale/legal/sla')({
  component: SlaPage,
  head: () =>
    createPageHead({
      description:
        'Tuturuuu Service Level Agreement framework for enterprise order forms, maintenance, incidents, exclusions, and service credits.',
      title: 'Service Level Agreement',
    }),
});

function SlaPage() {
  const { locale } = Route.useParams();
  return (
    <LegalPageLayout
      config={toLegalPageConfig(getLegalDocument('sla', locale))}
    />
  );
}
