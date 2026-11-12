import { createFileRoute } from '@tanstack/react-router';
import { RoadmapPage } from '../pages/roadmap';
import { roadmapHead } from '../pages/roadmap-head';

/** The Vietnamese roadmap: its own URL, so search engines can index it. */
export const Route = createFileRoute('/vi')({
  head: () => roadmapHead('vi'),
  component: () => <RoadmapPage lang="vi" />,
});
