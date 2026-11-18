import { createServerFn } from '@tanstack/react-start';
import type { RoadmapEnv } from './activity-object';
import type { RoadmapObservation } from './activity-refresh';

export const loadActivity = createServerFn({ method: 'GET' }).handler(
  async () => {
    try {
      const { env } = await import('cloudflare:workers');
      const { ROADMAP_ACTIVITY, ROADMAP_REFRESH_ENABLED } = env as RoadmapEnv;
      if (ROADMAP_REFRESH_ENABLED !== 'true') return null;
      const payload = await ROADMAP_ACTIVITY?.getByName('v1').readSnapshot();
      // The singleton serializes its own typed observation across RPC.
      return payload ? (JSON.parse(payload) as RoadmapObservation) : null;
    } catch {
      return null;
    }
  }
);
