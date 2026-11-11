'use client';

import { MenuIcon } from '@tuturuuu/icons/lucide-static';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

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
  const [requested, setRequested] = useState(false);
  const t = useTranslations('common');
  return (
    <div className="flex gap-2 md:hidden">
      {requested ? (
        <MobileMenu sbUser={sbUser} user={user} initiallyOpen />
      ) : (
        <button
          type="button"
          aria-label={t('main_navigation')}
          aria-expanded={false}
          onClick={() => setRequested(true)}
          className="rounded-lg p-2 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
        >
          <MenuIcon className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}
