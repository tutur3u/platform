'use client';

import type { ComponentType } from 'react';
import { useEffect, useState } from 'react';
import type { MiraDashboardClientProps } from './mira-dashboard-client-types';

type MiraDashboardClientImplComponent = ComponentType<MiraDashboardClientProps>;

function useMiraDashboardClientImplComponent() {
  const [MiraDashboardClientImpl, setMiraDashboardClientImpl] =
    useState<MiraDashboardClientImplComponent | null>(null);

  useEffect(() => {
    let active = true;

    void import('./mira-dashboard-client-impl').then((module) => {
      if (active) {
        setMiraDashboardClientImpl(() => module.default);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  return MiraDashboardClientImpl;
}

function MiraDashboardClientFallback() {
  return (
    <div className="relative flex h-[calc(100vh-5rem)] min-h-0 flex-col overflow-hidden md:h-[calc(100vh-2rem)]">
      <div className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col gap-3 sm:gap-4">
        <div className="relative flex min-h-0 min-w-0 max-w-full flex-1 flex-col overflow-hidden rounded-xl border border-border/60 bg-card/50 p-3 pb-0 shadow-sm backdrop-blur-sm sm:p-4">
          <div className="flex min-h-0 flex-1 animate-pulse flex-col rounded-lg bg-foreground/5" />
        </div>
      </div>
    </div>
  );
}

export default function MiraDashboardClient(props: MiraDashboardClientProps) {
  const MiraDashboardClientImpl = useMiraDashboardClientImplComponent();

  if (!MiraDashboardClientImpl) {
    return <MiraDashboardClientFallback />;
  }

  return <MiraDashboardClientImpl {...props} />;
}
