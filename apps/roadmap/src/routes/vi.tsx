import { loadActivity } from '../activity-loader';
import { createFileRoute } from '@tanstack/react-router';
import { PulseRoadmap } from '../pulse/pulse-roadmap';
import { roadmapHead } from '@tuturuuu/roadmap-core/pages/roadmap-head.ts';

/** The Vietnamese roadmap: its own URL, so search engines can index it. */
export const Route = createFileRoute('/vi')({
  head: () => roadmapHead('vi'),
  loader: () => loadActivity(),
  component: () => {
    const data = Route.useLoaderData();
    return <PulseRoadmap lang="vi" {...data} />;
  },
});
