import { createFileRoute } from '@tanstack/react-router';
import { securityHead } from '../security-head';
import { SecurityPage } from '../security-page';

export const Route = createFileRoute('/vi/security/bug-bounty')({
  head: () => securityHead('bug-bounty', 'vi'),
  component: () => <SecurityPage kind="bug-bounty" locale="vi" />,
});
