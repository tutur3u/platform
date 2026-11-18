import { loadActivity } from '../activity-loader';
import { createFileRoute } from '@tanstack/react-router';
import { PulseRoadmap } from '../pulse/pulse-roadmap';
import { roadmapHead } from '@tuturuuu/roadmap-core/pages/roadmap-head.ts';

export const Route = createFileRoute('/')({
  head: () => roadmapHead('en'),
  loader: () => loadActivity(),
  component: () => {
    const data = Route.useLoaderData();
    return <PulseRoadmap lang="en" {...data} />;
  },
});
