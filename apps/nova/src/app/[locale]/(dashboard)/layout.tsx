import Structure from '@/components/layout/structure';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import {
  Code,
  Home,
  LayoutDashboard,
  List,
  ShieldCheck,
  Trophy,
} from 'lucide-react';
import { redirect } from 'next/navigation';
import React from 'react';

const navItems = [
  { name: 'Home', href: '/', icon: <Home className="h-4 w-4" /> },
  {
    name: 'Dashboard',
    href: '/dashboard',
    icon: <LayoutDashboard className="h-4 w-4" />,
  },
  {
    name: 'Challenges',
    href: '/challenges',
    icon: <Code className="h-4 w-4" />,
  },
  {
    name: 'Problems',
    href: '/problems',
    icon: <List className="h-4 w-4" />,
    requiresAdmin: true,
  },
  {
    name: 'Leaderboard',
    href: '/leaderboard',
    icon: <Trophy className="h-4 w-4" />,
  },
  {
    name: 'Roles',
    href: '/roles',
    subItems: [] as { name: string; href: string }[],
    icon: <ShieldCheck className="h-4 w-4" />,
    requiresAdmin: true,
  },
];

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const sbAdmin = await createAdminClient();
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) redirect('/login');

  const { data: whitelisted } = await sbAdmin
    .from('nova_roles')
    .select('enabled, is_admin')
    .eq('email', user?.email as string)
    .maybeSingle();

  if (!whitelisted?.enabled) redirect('/not-whitelisted');

  return (
    <Structure isAdmin={whitelisted?.is_admin || false} navItems={navItems}>
      {children}
    </Structure>
  );
}
