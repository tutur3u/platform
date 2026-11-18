import { createServerFn } from '@tanstack/react-start';
import type { RoadmapEnv, StoredRoadmapObservation } from './activity-object';

export const loadActivity = createServerFn({ method: 'GET' }).handler(
  async () => {
    try {
      const { env } = await import('cloudflare:workers');
      const { ROADMAP_ACTIVITY, ROADMAP_REFRESH_ENABLED } = env as RoadmapEnv;
      if (ROADMAP_REFRESH_ENABLED !== 'true')
        return { observation: null, now: Date.now() };
      const payload = await ROADMAP_ACTIVITY?.getByName('v1').readSnapshot();
      // The singleton only serializes its own stored observation. A primitive
      // RPC result avoids stub metadata and preserves the typed commit tuples.
      const observation = payload
        ? (JSON.parse(payload) as StoredRoadmapObservation)
        : null;
      return { observation, now: Date.now() };
    } catch {
      return { observation: null, now: Date.now() };
    }
  }
);
