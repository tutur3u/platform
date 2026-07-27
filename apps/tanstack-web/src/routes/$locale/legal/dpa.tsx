import { createFileRoute } from '@tanstack/react-router';
import { getLegalDocument } from '@tuturuuu/legal';
import { toLegalPageConfig } from '../../../components/legal/canonical-legal-config';
import { LegalPageLayout } from '../../../components/legal/legal-page-layout';
import { createPageHead } from '../../../lib/platform/head';

export const Route = createFileRoute('/$locale/legal/dpa')({
  component: DpaPage,
  head: () =>
    createPageHead({
      description:
        'Tuturuuu Data Processing Addendum covering instructions, safeguards, subprocessors, transfers, incidents, audits, and deletion.',
      title: 'Data Processing Addendum',
    }),
});

function DpaPage() {
  const { locale } = Route.useParams();
  return (
    <LegalPageLayout
      config={toLegalPageConfig(getLegalDocument('dpa', locale))}
    />
  );
}
