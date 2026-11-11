import { createFileRoute } from '@tanstack/react-router';
import { EduFestWorkshopPage, edufestHead } from '../../pages/edufest';

export const Route = createFileRoute('/workshops/edufest-2026')({
  head: () => edufestHead('en'),
  component: () => <EduFestWorkshopPage lang="en" />,
});
