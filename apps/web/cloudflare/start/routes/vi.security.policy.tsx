import { createFileRoute } from '@tanstack/react-router';
import { securityHead } from '../security-head';
import { SecurityPage } from '../security-page';

export const Route = createFileRoute('/vi/security/policy')({
  head: () => securityHead('security-policy', 'vi'),
  component: () => <SecurityPage kind="security-policy" locale="vi" />,
});
