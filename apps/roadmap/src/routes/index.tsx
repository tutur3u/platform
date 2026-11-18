import { loadActivity } from '../activity-loader';
import { createFileRoute } from '@tanstack/react-router';
import { RoadmapPage } from '@tuturuuu/roadmap-core/pages/roadmap.tsx';
import { roadmapHead } from '@tuturuuu/roadmap-core/pages/roadmap-head.ts';

export const Route = createFileRoute('/')({
  head: () => roadmapHead('en'),
  loader: () => loadActivity(),
  component: () => {
    const activity = Route.useLoaderData();
    return <RoadmapPage lang="en" observation={activity} />;
  },
});
