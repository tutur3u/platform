import { createFileRoute } from '@tanstack/react-router';
import { EduFestWorkshopPage, edufestHead } from '../pages/edufest';

/** The Vietnamese workshop page: its own URL, so search engines can index it. */
export const Route = createFileRoute('/vi_/workshops/edufest-2026')({
  head: () => edufestHead('vi'),
  component: () => <EduFestWorkshopPage lang="vi" />,
});
