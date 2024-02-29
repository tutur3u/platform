'use client';

import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { ActivitySquare } from 'lucide-react';
import useTranslation from 'next-translate/useTranslation';
import Link from 'next/link';

interface Props {
  defaultWorkspaceId: string | undefined;
}

export default function DashboardMenuItem({ defaultWorkspaceId }: Props) {
  const { t } = useTranslation('common');

  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <Link href={`/${defaultWorkspaceId || 'onboarding'}`}>
          <DropdownMenuItem className="cursor-pointer">
            <ActivitySquare className="mr-2 h-4 w-4" />
            <span>{t('dashboard')}</span>
          </DropdownMenuItem>
        </Link>
      </DropdownMenuGroup>
    </>
  );
}
