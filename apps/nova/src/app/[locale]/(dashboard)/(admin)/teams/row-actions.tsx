'use client';

import { Row } from '@tanstack/react-table';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { Ellipsis, Settings } from '@tuturuuu/ui/icons';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

interface Team {
  id: string;
  name: string;
  created_at: string;
  member_count?: number;
  invitation_count?: number;
}

interface TeamRowActionsProps {
  row: Row<Team>;
}

export function TeamRowActions({ row }: TeamRowActionsProps) {
  const router = useRouter();
  const t = useTranslations();

  const data = row.original;

  const deleteTeam = async () => {
    try {
      const res = await fetch(`/api/v1/nova/teams/${data.id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        router.refresh();
        toast.success(t('teams.delete_success'));
      } else {
        const errorData = await res.json();
        toast.error(errorData.error || t('teams.delete_error'));
      }
    } catch (error) {
      console.error('Error deleting team:', error);
      toast.error(t('teams.delete_error'));
    }
  };

  const manageTeam = () => {
    router.push(`/teams/${data.id}`);
  };

  return (
    <div className="flex items-center justify-end gap-2">
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={manageTeam}
      >
        <Settings className="h-4 w-4" />
        <span className="sr-only">{t('teams.manage')}</span>
      </Button>

      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="data-[state=open]:bg-muted flex h-8 w-8 p-0"
          >
            <Ellipsis className="h-4 w-4" />
            <span className="sr-only">Open menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[180px]">
          <DropdownMenuItem onClick={deleteTeam}>
            {t('common.delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
