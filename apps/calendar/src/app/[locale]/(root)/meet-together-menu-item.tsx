'use client';

import {
  DropdownMenuGroup,
  DropdownMenuItem,
} from '@tuturuuu/ui/dropdown-menu';
import { CalendarClock } from '@tuturuuu/ui/icons';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { CENTRAL_PORT, DEV_MODE } from '@/constants/common';

export default function MeetTogetherMenuItem() {
  const t = useTranslations('common');

  return (
    <DropdownMenuGroup>
      <Link
        href={`${
          DEV_MODE
            ? `http://localhost:${CENTRAL_PORT}/meet-together`
            : `https://tuturuuu.com/meet-together`
        }`}
      >
        <DropdownMenuItem className="cursor-pointer">
          <CalendarClock className="mr-2 h-4 w-4" />
          <span>{t('meet-together')}</span>
        </DropdownMenuItem>
      </Link>
    </DropdownMenuGroup>
  );
}
