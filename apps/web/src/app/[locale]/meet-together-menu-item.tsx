'use client';

import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@tuturuuu/ui/dropdown-menu';
import { CalendarClock } from '@tuturuuu/ui/icons';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function MeetTogetherMenuItem() {
  const t = useTranslations('common');
  const pathname = usePathname();

  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        {pathname === `/calendar/meet-together` ? (
          <DropdownMenuItem disabled>
            <CalendarClock className="mr-2 h-4 w-4" />
            <span>{t('meet-together')}</span>
          </DropdownMenuItem>
        ) : (
          <Link href="/calendar/meet-together">
            <DropdownMenuItem className="cursor-pointer">
              <CalendarClock className="mr-2 h-4 w-4" />
              <span>{t('meet-together')}</span>
            </DropdownMenuItem>
          </Link>
        )}
      </DropdownMenuGroup>
    </>
  );
}
