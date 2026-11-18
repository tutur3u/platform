import { createServerFn } from '@tanstack/react-start';
import type { RoadmapEnv } from './activity-object';

export const loadActivity = createServerFn({ method: 'GET' }).handler(
  async () => {
    try {
      const { env } = await import('cloudflare:workers');
      const { ROADMAP_ACTIVITY, ROADMAP_REFRESH_ENABLED } = env as RoadmapEnv;
      if (ROADMAP_REFRESH_ENABLED !== 'true') return null;
      return (await ROADMAP_ACTIVITY?.getByName('v1').read()) ?? null;
    } catch {
      return null;
    }
  }
);
