'use client';

import { UserPlus } from '@tuturuuu/icons/lucide-static';
import { DropdownMenuItem } from '@tuturuuu/ui/dropdown-menu';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

/** The workspace members page, listed after Settings in the account menu. */
export default function InviteMembersMenuItem({ wsId }: { wsId: string }) {
  const t = useTranslations('common');
  const pathname = usePathname();
  const href = `/${wsId}/members`;

  if (pathname === href) {
    return (
      <DropdownMenuItem disabled>
        <UserPlus className="h-4 w-4 text-dynamic-sky" />
        <span>{t('invite_users')}</span>
      </DropdownMenuItem>
    );
  }

  return (
    <DropdownMenuItem asChild className="cursor-pointer">
      <Link href={href}>
        <UserPlus className="h-4 w-4 text-dynamic-sky" />
        <span>{t('invite_users')}</span>
      </Link>
    </DropdownMenuItem>
  );
}
