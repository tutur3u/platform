import { createFileRoute } from '@tanstack/react-router';
import { getLegalDocument } from '@tuturuuu/legal';
import { toLegalPageConfig } from '../../../components/legal/canonical-legal-config';
import { LegalPageLayout } from '../../../components/legal/legal-page-layout';
import { createPageHead } from '../../../lib/platform/head';

export const Route = createFileRoute('/$locale/legal/subprocessors')({
  component: SubprocessorsPage,
  head: () =>
    createPageHead({
      description:
        'Maintained Tuturuuu subprocessor registry with purposes, data categories, processing regions, privacy links, and change dates.',
      title: 'Subprocessor Registry',
    }),
});

function SubprocessorsPage() {
  const { locale } = Route.useParams();
  return (
    <LegalPageLayout
      config={toLegalPageConfig(getLegalDocument('subprocessors', locale))}
    />
  );
}
