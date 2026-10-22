import { OfflineProvider } from '@tuturuuu/offline/provider';
import type { ReactNode } from 'react';
import { OFFLINE_SCOPE, OFFLINE_WORKER_URL } from './offline-assets';
import offlineWorkerUrl from './offline-worker?worker&url';

export function CalendarOfflineProvider({ children }: { children: ReactNode }) {
  if (import.meta.env.PROD && offlineWorkerUrl !== OFFLINE_WORKER_URL)
    throw new Error(
      'Calendar emitted service worker URL differs from its registration contract'
    );
  return (
    <OfflineProvider
      swUrl={offlineWorkerUrl}
      options={{ scope: OFFLINE_SCOPE }}
    >
      {children}
    </OfflineProvider>
  );
}
