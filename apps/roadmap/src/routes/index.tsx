import { createFileRoute } from '@tanstack/react-router';
import { RoadmapPage } from '@tuturuuu/roadmap-core/pages/roadmap.tsx';
import { roadmapHead } from '@tuturuuu/roadmap-core/pages/roadmap-head.ts';

export const Route = createFileRoute('/')({
  head: () => roadmapHead('en'),
  component: () => <RoadmapPage lang="en" />,
});
