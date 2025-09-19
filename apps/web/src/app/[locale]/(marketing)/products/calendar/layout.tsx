import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Calendar Product',
  description:
    'Coordinate schedules with the shared Tuturuuu calendar experience.',
};

export default function CalendarLayout({ children }: { children: ReactNode }) {
  return children;
}
