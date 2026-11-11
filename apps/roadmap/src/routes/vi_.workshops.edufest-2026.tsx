import { createFileRoute } from '@tanstack/react-router';
import { EduFestWorkshopPage } from '../pages/edufest';
import { edufestHead } from '../pages/edufest-head';

/** The Vietnamese workshop page: its own URL, so search engines can index it. */
export const Route = createFileRoute('/vi_/workshops/edufest-2026')({
  head: () => edufestHead('vi'),
  component: () => <EduFestWorkshopPage lang="vi" />,
});
