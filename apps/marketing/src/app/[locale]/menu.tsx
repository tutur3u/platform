'use client';

import { MenuIcon } from '@tuturuuu/icons/lucide-static';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import dynamic from 'next/dynamic';

interface MenuProps {
  sbUser: SupabaseUser | null;
  user: WorkspaceUser | null;
}

const MobileMenu = dynamic(
  () => import('./mobile-menu').then((module) => module.MobileMenu),
  {
    ssr: false,
    loading: () => (
      <div className="flex gap-2 md:hidden">
        <button
          type="button"
          aria-label="Open menu"
          className="rounded-lg p-2 transition-all hover:bg-accent active:bg-accent/80"
        >
          <MenuIcon className="h-5 w-5" />
        </button>
      </div>
    ),
  }
);

export default function Menu({ sbUser, user }: MenuProps) {
  return (
    <div className="flex gap-2 md:hidden">
      <MobileMenu sbUser={sbUser} user={user} />
    </div>
  );
}
