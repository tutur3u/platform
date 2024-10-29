import { NavLink, Navigation } from '@/components/navigation';
import React from 'react';

interface LayoutProps {
  params: Promise<{
    wsId?: string;
  }>;
  children: React.ReactNode;
}

export default async function Layout({ children, params }: LayoutProps) {
  const { wsId } = await params;
  const navLinks: NavLink[] = [
    {
      title: 'Overview',
      href: `/${wsId}/healthcare`,
      matchExact: true,
    },
    {
      title: 'Checkups',
      href: `/${wsId}/healthcare/checkups`,
    },
    {
      title: 'Diagnoses',
      href: `/${wsId}/healthcare/diagnoses`,
    },
    {
      title: 'Vitals',
      href: `/${wsId}/healthcare/vitals`,
    },
    {
      title: 'Vital groups',
      href: `/${wsId}/healthcare/vital-groups`,
    },
  ];

  return (
    <div>
      <Navigation navLinks={navLinks} />
      {children}
    </div>
  );
}
