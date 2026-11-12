import { createFileRoute } from '@tanstack/react-router';
import { EduFestWorkshopPage } from '../../pages/edufest';
import { edufestHead } from '../../pages/edufest-head';

export const Route = createFileRoute('/workshops/edufest-2026')({
  head: () => edufestHead('en'),
  component: () => <EduFestWorkshopPage lang="en" />,
});
