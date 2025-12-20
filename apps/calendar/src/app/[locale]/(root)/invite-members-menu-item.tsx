'use client';

import { UserPlus } from '@tuturuuu/icons';
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@tuturuuu/ui/dropdown-menu';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

export default function InviteMembersMenuItem() {
  const t = useTranslations('common');
  const pathname = usePathname();
  const params = useParams();

  const { wsId } = params;
  if (!wsId) return null;

  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        {pathname === `/${wsId}/members` ? (
          <DropdownMenuItem disabled>
            <UserPlus className="mr-2 h-4 w-4" />
            <span>{t('invite_users')}</span>
          </DropdownMenuItem>
        ) : (
          <Link href={`/${wsId}/members`}>
            <DropdownMenuItem className="cursor-pointer">
              <UserPlus className="mr-2 h-4 w-4" />
              <span>{t('invite_users')}</span>
            </DropdownMenuItem>
          </Link>
        )}
      </DropdownMenuGroup>
    </>
  );
}
