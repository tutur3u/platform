'use client';

import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@repo/ui/components/ui/dropdown-menu';
import { CalendarClock } from 'lucide-react';
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
        {pathname === `/meet-together` ? (
          <DropdownMenuItem disabled>
            <CalendarClock className="mr-2 h-4 w-4" />
            <span>{t('meet-together')}</span>
          </DropdownMenuItem>
        ) : (
          <Link href="/meet-together">
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
