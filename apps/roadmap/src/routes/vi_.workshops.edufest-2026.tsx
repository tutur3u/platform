import { createFileRoute } from '@tanstack/react-router';
import { EduFestWorkshopPage } from '@tuturuuu/roadmap-core/pages/edufest.tsx';
import { edufestHead } from '@tuturuuu/roadmap-core/pages/edufest-head.ts';

/** The Vietnamese workshop page: its own URL, so search engines can index it. */
export const Route = createFileRoute('/vi_/workshops/edufest-2026')({
  head: () => edufestHead('vi'),
  component: () => <EduFestWorkshopPage lang="vi" />,
});
