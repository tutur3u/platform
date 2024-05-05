'use client';

import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { DEV_MODE } from '@/constants/common';
import { ActivitySquare, Database } from 'lucide-react';
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

        {DEV_MODE && (
          <Link
            href="http://localhost:8003/project/default/editor"
            target="_blank"
          >
            <DropdownMenuItem className="cursor-pointer">
              <Database className="mr-2 h-4 w-4" />
              <span>{t('local_database')}</span>
            </DropdownMenuItem>
          </Link>
        )}
      </DropdownMenuGroup>
    </>
  );
}
