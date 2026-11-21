import { createOfflineRoute } from '@tuturuuu/offline/route';
import { WEB_OFFLINE_WORKER_CONFIG } from '@/lib/offline-worker-config';

export const { GET, generateStaticParams } = createOfflineRoute(
  WEB_OFFLINE_WORKER_CONFIG
);
