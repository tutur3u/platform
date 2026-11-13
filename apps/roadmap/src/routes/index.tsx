import { createFileRoute } from '@tanstack/react-router';
import { RoadmapPage } from '../pages/roadmap';
import { roadmapHead } from '../pages/roadmap-head';

export const Route = createFileRoute('/')({
  head: () => roadmapHead('en'),
  component: () => <RoadmapPage lang="en" />,
});
