'use client';

import { CalendarProvider } from '@/contexts/CalendarContext';
import React from 'react';

interface ClientLayoutWrapperProps {
  children: React.ReactNode;
  defaultLabels: {
    day: string;
    '4-days': string;
    week: string;
    month: string;
  };
}

export default function ClientLayoutWrapper({
  children,
  defaultLabels,
}: ClientLayoutWrapperProps) {
  return (
    <CalendarProvider defaultLabels={defaultLabels}>
      {children}
    </CalendarProvider>
  );
}
