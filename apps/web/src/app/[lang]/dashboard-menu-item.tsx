'use client';

import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { ActivitySquare } from 'lucide-react';
import useTranslation from 'next-translate/useTranslation';
import Link from 'next/link';
import { useParams } from 'next/navigation';

interface Props {
  defaultWorkspaceId: string | undefined;
}

export default function DashboardMenuItem({ defaultWorkspaceId }: Props) {
  const { t } = useTranslation('common');
  const params = useParams();

  const hasWorkspace = !!params.wsId;
  if (hasWorkspace) return null;

  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <Link href={`/${defaultWorkspaceId}`}>
          <DropdownMenuItem className="cursor-pointer">
            <ActivitySquare className="mr-2 h-4 w-4" />
            <span>{t('dashboard')}</span>
          </DropdownMenuItem>
        </Link>
      </DropdownMenuGroup>
    </>
  );
}
