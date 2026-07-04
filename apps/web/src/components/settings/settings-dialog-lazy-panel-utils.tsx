'use client';

import type { ComponentType, LazyExoticComponent, ReactNode } from 'react';
import { Suspense } from 'react';

function SettingsPanelFallback() {
  return (
    <div className="space-y-4 py-1">
      <div className="h-5 w-40 animate-pulse rounded bg-muted" />
      <div className="h-20 animate-pulse rounded-md bg-muted" />
      <div className="h-20 animate-pulse rounded-md bg-muted" />
    </div>
  );
}

export function PanelSuspense({ children }: { children: ReactNode }) {
  return <Suspense fallback={<SettingsPanelFallback />}>{children}</Suspense>;
}

export function withPanelSuspense<P extends object>(
  Component: LazyExoticComponent<ComponentType<P>>
) {
  return function LazySettingsPanel(props: P) {
    return (
      <PanelSuspense>
        <Component {...props} />
      </PanelSuspense>
    );
  };
}
