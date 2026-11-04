import { createFileRoute } from '@tanstack/react-router';
import { LegalChanges } from '../../../src/components/legal/legal-changes';
export const Route = createFileRoute('/legal/changes_/full')({
  head: () => ({ meta: [{ name: 'robots', content: 'noindex, nofollow' }] }),
  component: () => <LegalChanges locale="en" full={true} />,
});
