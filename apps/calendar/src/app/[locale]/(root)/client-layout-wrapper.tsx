'use client';

import { DEV_MODE } from '@/constants/common';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarProvider } from '@tuturuuu/ui/hooks/use-calendar';
import React from 'react';

interface ClientLayoutWrapperProps {
  children: React.ReactNode;
}

export default function ClientLayoutWrapper({
  children,
}: ClientLayoutWrapperProps) {
  return (
    <CalendarProvider
      useQuery={useQuery}
      useQueryClient={useQueryClient}
      enableExperimentalGoogleCalendar={DEV_MODE}
    >
      {children}
    </CalendarProvider>
  );
}
