'use client';

import { type ComponentProps, lazy, Suspense } from 'react';

const SettingsContent = lazy(() =>
  import('./calendar-connections-settings-content').then((module) => ({
    default: module.CalendarConnectionsSettingsContent,
  }))
);

export function CalendarConnectionsSettingsContent(
  props: ComponentProps<typeof SettingsContent>
) {
  return (
    <Suspense
      fallback={
        <div
          aria-busy="true"
          className="h-64 animate-pulse rounded-lg bg-muted/50"
        />
      }
    >
      <SettingsContent {...props} />
    </Suspense>
  );
}
