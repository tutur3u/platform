import { DEV_MODE } from '@/constants/common';
import { getWorkspaces } from '@/lib/workspace-helper';
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@repo/ui/components/ui/dropdown-menu';
import { ActivitySquare, Database } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

export default async function DashboardMenuItem() {
  const t = await getTranslations('common');

  const workspaces = await getWorkspaces(true);

  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <Link href={`/${workspaces?.[0]?.id || 'onboarding'}`}>
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
