'use client';

import type { Row } from '@tanstack/react-table';
import { Copy, Ellipsis, Eye } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import type { EmailAuditRecord } from './columns';

interface EmailAuditRowActionsProps {
  row: Row<EmailAuditRecord>;
  onViewDetails?: (entry: EmailAuditRecord) => void;
}

export function EmailAuditRowActions({
  row,
  onViewDetails,
}: EmailAuditRowActionsProps) {
  const t = useTranslations('email-audit-data-table');
  const entry = row.original;

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(t('copied'), {
      description: `${label} ${t('copied_to_clipboard')}`,
    });
  };

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="flex h-8 w-8 p-0 data-[state=open]:bg-muted"
        >
          <Ellipsis className="h-4 w-4" />
          <span className="sr-only">{t('actions')}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem
          onClick={(e) => {
            e.stopPropagation();
            onViewDetails?.(entry);
          }}
        >
          <Eye className="mr-2 h-4 w-4" />
          {t('view_details')}
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {entry.message_id && (
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              copyToClipboard(entry.message_id!, t('message_id'));
            }}
          >
            <Copy className="mr-2 h-4 w-4" />
            {t('copy_message_id')}
          </DropdownMenuItem>
        )}

        <DropdownMenuItem
          onClick={(e) => {
            e.stopPropagation();
            copyToClipboard(entry.to_addresses.join(', '), t('to_addresses'));
          }}
        >
          <Copy className="mr-2 h-4 w-4" />
          {t('copy_recipients')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
