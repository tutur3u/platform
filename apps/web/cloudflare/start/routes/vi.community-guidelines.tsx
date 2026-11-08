import { createFileRoute } from '@tanstack/react-router';
import { legalHead } from '../legal-head';
import { LegalPage } from '../legal-page';

export const Route = createFileRoute('/vi/community-guidelines')({
  head: () => legalHead('community-guidelines', 'vi'),
  component: () => <LegalPage kind="community-guidelines" locale="vi" />,
});
