import { createFileRoute } from '@tanstack/react-router';
import { RoadmapPage } from '@tuturuuu/roadmap-core/pages/roadmap.tsx';
import { roadmapHead } from '@tuturuuu/roadmap-core/pages/roadmap-head.ts';

/** The Vietnamese roadmap: its own URL, so search engines can index it. */
export const Route = createFileRoute('/vi')({
  head: () => roadmapHead('vi'),
  component: () => <RoadmapPage lang="vi" />,
});
