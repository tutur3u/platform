'use client';

import TimezoneEditDialog from './edit-dialog';
import { Row } from '@tanstack/react-table';
import { Timezone } from '@tutur3u/types/primitives/Timezone';
import { Button } from '@tutur3u/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tutur3u/ui/dropdown-menu';
import { toast } from '@tutur3u/ui/hooks/use-toast';
import { Ellipsis } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface TimezoneRowActionsProps {
  row: Row<Timezone>;
}

export function TimezoneRowActions({ row }: TimezoneRowActionsProps) {
  const router = useRouter();
  const t = useTranslations();

  const timezone = row.original;

  const syncTimezone = async () => {
    const res = await fetch(`/api/v1/infrastructure/timezones`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: timezone.id,
        value: timezone.value,
        abbr: timezone.abbr,
        offset: timezone.offset,
        isdst: timezone.isdst,
        text: timezone.text,
        utc: timezone.utc,
      }),
    });

    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json();
      toast({
        title: 'Failed to sync workspace timezone',
        description: data.message,
      });
    }
  };

  const deleteTimezone = async () => {
    const res = await fetch(`/api/v1/infrastructure/timezones/${timezone.id}`, {
      method: 'DELETE',
    });

    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json();
      toast({
        title: 'Failed to delete workspace timezone',
        description: data.message,
      });
    }
  };

  const [showEditDialog, setShowEditDialog] = useState(false);

  if (!timezone.value) return null;

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="flex h-8 w-8 p-0 data-[state=open]:bg-muted"
          >
            <Ellipsis className="h-4 w-4" />
            <span className="sr-only">Open menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[160px]">
          <DropdownMenuItem onClick={syncTimezone}>Sync</DropdownMenuItem>

          {timezone?.id != null && (
            <>
              <DropdownMenuItem onClick={() => setShowEditDialog(true)}>
                {t('common.edit')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={deleteTimezone}
                disabled={!timezone?.id}
              >
                {t('common.delete')}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <TimezoneEditDialog
        data={timezone}
        open={showEditDialog}
        setOpen={setShowEditDialog}
        submitLabel={'edit_timezone'}
      />
    </>
  );
}
