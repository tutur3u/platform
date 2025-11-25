'use client';

import type { ReactNode } from 'react';
import {
  type CalendarSettings,
  CalendarSettingsProvider,
} from './settings-context';

interface CalendarSettingsWrapperProps {
  children: ReactNode;
  initialSettings?: Partial<CalendarSettings>;
  wsId?: string;
}

export function CalendarSettingsWrapper({
  children,
  initialSettings,
  wsId,
}: CalendarSettingsWrapperProps) {
  return (
    <CalendarSettingsProvider initialSettings={initialSettings} wsId={wsId}>
      {children}
    </CalendarSettingsProvider>
  );
}
