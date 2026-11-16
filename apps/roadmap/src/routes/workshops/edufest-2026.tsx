import { createFileRoute } from '@tanstack/react-router';
import { EduFestWorkshopPage } from '@tuturuuu/roadmap-core/pages/edufest.tsx';
import { edufestHead } from '@tuturuuu/roadmap-core/pages/edufest-head.ts';

export const Route = createFileRoute('/workshops/edufest-2026')({
  head: () => edufestHead('en'),
  component: () => <EduFestWorkshopPage lang="en" />,
});
