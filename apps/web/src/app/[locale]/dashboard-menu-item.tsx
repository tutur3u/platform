import { useQuery } from '@tanstack/react-query';
import { ActivitySquare, Database } from '@tuturuuu/icons';
import { getCurrentUserDefaultWorkspace } from '@tuturuuu/internal-api';
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@tuturuuu/ui/dropdown-menu';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { DEV_MODE } from '@/constants/common';

export default function DashboardMenuItem() {
  const t = useTranslations('common');

  const defaultWorkspaceQuery = useQuery({
    queryKey: ['default-workspace'],
    queryFn: fetchDefaultWorkspace,
  });

  const defaultWorkspace = defaultWorkspaceQuery.data;

  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <Link href={`/${defaultWorkspace?.id || 'onboarding'}`}>
          <DropdownMenuItem className="cursor-pointer">
            <ActivitySquare className="h-4 w-4 text-dynamic-green" />
            <span>{t('dashboard')}</span>
          </DropdownMenuItem>
        </Link>
        {DEV_MODE && (
          <Link
            href="http://localhost:8003/project/default/editor"
            target="_blank"
          >
            <DropdownMenuItem className="cursor-pointer">
              <Database className="h-4 w-4 text-dynamic-yellow" />
              <span>{t('local_database')}</span>
            </DropdownMenuItem>
          </Link>
        )}
      </DropdownMenuGroup>
    </>
  );
}

async function fetchDefaultWorkspace() {
  return getCurrentUserDefaultWorkspace({ fetch });
}
