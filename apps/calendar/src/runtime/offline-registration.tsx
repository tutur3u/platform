import { OfflineProvider } from '@tuturuuu/offline/provider';
import { runtimeAppBase, withAppBase } from '@tuturuuu/start-bridge/app-url';
import type { ReactNode } from 'react';
import { calendarOfflineContract } from './offline-assets';
import offlineWorkerUrl from './offline-worker?worker&url';

export function CalendarOfflineProvider({ children }: { children: ReactNode }) {
  const contract = calendarOfflineContract(runtimeAppBase());
  const workerUrl = withAppBase(offlineWorkerUrl);
  if (import.meta.env.PROD && workerUrl !== contract.workerUrl)
    throw new Error(
      'Calendar emitted service worker URL differs from its registration contract'
    );
  return (
    <OfflineProvider swUrl={workerUrl} options={{ scope: contract.scope }}>
      {children}
    </OfflineProvider>
  );
}
