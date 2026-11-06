import { createFileRoute } from '@tanstack/react-router';
import { LegalChanges } from '../../../src/components/legal/legal-changes';
export const Route = createFileRoute('/vi/legal/changes')({
  head: () => ({ meta: [{ name: 'robots', content: 'noindex, nofollow' }] }),
  component: () => <LegalChanges locale="vi" full={false} />,
});
