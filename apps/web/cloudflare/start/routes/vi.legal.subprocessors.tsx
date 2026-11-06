import { createFileRoute } from '@tanstack/react-router';
import { legalHead } from '../legal-head';
import { LegalPage } from '../legal-page';

export const Route = createFileRoute('/vi/legal/subprocessors')({
  head: () => legalHead('subprocessors', 'vi'),
  component: () => <LegalPage kind="subprocessors" locale="vi" />,
});
