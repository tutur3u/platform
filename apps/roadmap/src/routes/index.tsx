import { createFileRoute } from '@tanstack/react-router';
import { RoadmapPage, roadmapHead } from '../pages/roadmap';

export const Route = createFileRoute('/')({
  head: () => roadmapHead('en'),
  component: () => <RoadmapPage lang="en" />,
});
