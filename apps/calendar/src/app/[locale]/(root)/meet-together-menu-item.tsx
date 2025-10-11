'use client';

import { CENTRAL_PORT, DEV_MODE } from '@/constants/common';
import { CalendarClock } from '@tuturuuu/icons';
import {
  DropdownMenuGroup,
  DropdownMenuItem,
} from '@tuturuuu/ui/dropdown-menu';
import { useTranslations } from 'next-intl';
import Link from 'next/link';

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
