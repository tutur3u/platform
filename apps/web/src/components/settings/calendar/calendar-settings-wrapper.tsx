'use client';

import type { ReactNode } from 'react';
import { CalendarSettingsProvider } from './settings-context';

interface CalendarSettingsWrapperProps {
  children: ReactNode;
}

export function CalendarSettingsWrapper({
  children,
}: CalendarSettingsWrapperProps) {
  return <CalendarSettingsProvider>{children}</CalendarSettingsProvider>;
}
