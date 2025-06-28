'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarProvider } from '@tuturuuu/ui/hooks/use-calendar';
import type React from 'react';

interface ClientLayoutWrapperProps {
  children: React.ReactNode;
}

export default function ClientLayoutWrapper({
  children,
}: ClientLayoutWrapperProps) {
  return (
    <CalendarProvider useQuery={useQuery} useQueryClient={useQueryClient}>
      {children}
    </CalendarProvider>
  );
}
