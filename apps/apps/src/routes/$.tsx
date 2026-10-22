import { createFileRoute, notFound } from '@tanstack/react-router';
import { Missing } from './__root';

export const Route = createFileRoute('/$')({
  beforeLoad: () => {
    throw notFound();
  },
  component: Missing,
  head: () => ({ meta: [{ name: 'robots', content: 'noindex, nofollow' }] }),
});
