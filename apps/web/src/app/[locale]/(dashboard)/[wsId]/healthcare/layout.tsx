import { NavLink, Navigation } from '@/components/navigation';
import React from 'react';

interface LayoutProps {
  params: {
    wsId?: string;
  };
  children: React.ReactNode;
}

export default async function Layout({
  children,
  params: { wsId },
}: LayoutProps) {
  const navLinks: NavLink[] = [
    {
      name: 'Overview',
      href: `/${wsId}/healthcare`,
      matchExact: true,
    },
    {
      name: 'Checkups',
      href: `/${wsId}/healthcare/checkups`,
    },
    {
      name: 'Diagnoses',
      href: `/${wsId}/healthcare/diagnoses`,
    },
    {
      name: 'Vitals',
      href: `/${wsId}/healthcare/vitals`,
    },
    {
      name: 'Vital groups',
      href: `/${wsId}/healthcare/vital-groups`,
    },
  ];

  return (
    <div>
      <div className="mb-4 flex gap-1 overflow-x-auto font-semibold">
        <Navigation navLinks={navLinks} />
      </div>
      {children}
    </div>
  );
}
