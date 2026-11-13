import { type AppMountConfig } from '@tuturuuu/start-bridge/mounts';
import { PRODUCTION_HOSTS } from './hosts';

/**
 * The Shortener serves its seven production hosts at their root and the
 * platform apex under `/shortener`, canonical without a trailing slash.
 * Previews and `*.workers.dev` hosts stay root-served for staging; the
 * Worker's canonical-host fence decides which surface is live.
 */
export const shortenerMounts = {
  app: 'shortener',
  rootHosts: [...PRODUCTION_HOSTS],
  mountHosts: ['tuturuuu.com'],
  basePath: '/shortener',
} satisfies AppMountConfig;
