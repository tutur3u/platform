import { createFileRoute } from '@tanstack/react-router';
import { legalHead } from '../legal-head';
import { LegalPage } from '../legal-page';

export const Route = createFileRoute('/vi/privacy')({
  head: () => legalHead('privacy', 'vi'),
  component: () => <LegalPage kind="privacy" locale="vi" />,
});
