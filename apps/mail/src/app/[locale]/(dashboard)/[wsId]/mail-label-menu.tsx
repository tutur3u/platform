'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { Bot, Loader2, Plus, Tag, X } from '@tuturuuu/icons';
import {
  bulkUpdateMailThreads,
  getMailboxOrganization,
  suggestMailLabels,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';

export function MailLabelMenu({
  mailboxId,
  onChanged,
  threadIds,
  workspaceId,
}: {
  mailboxId: string;
  onChanged: () => Promise<unknown>;
  threadIds: string[];
  workspaceId: string;
}) {
  const t = useTranslations('mail');
  const organization = useQuery({
    enabled: Boolean(mailboxId),
    queryFn: () => getMailboxOrganization(workspaceId, mailboxId),
    queryKey: ['mail', workspaceId, mailboxId, 'organization'],
  });
  const update = useMutation({
    mutationFn: ({
      action,
      labelId,
    }: {
      action: 'add_label' | 'remove_label';
      labelId: string;
    }) =>
      bulkUpdateMailThreads(workspaceId, mailboxId, {
        action,
        labelId,
        threadIds,
      }),
    onSuccess: async () => {
      await onChanged();
      toast.success(t('labels_updated'));
    },
  });
  const smart = useMutation({
    mutationFn: () =>
      suggestMailLabels(workspaceId, mailboxId, {
        action: 'classify',
        apply: true,
        threadIds,
      }),
    onSuccess: async (result) => {
      await onChanged();
      toast.success(t('smart_labels_applied', { count: result.applied }));
    },
  });
  const labels = (organization.data?.labels ?? []).filter(
    (label) => label.kind === 'custom'
  );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button aria-label={t('manage_labels')} size="icon" variant="ghost">
          <Tag className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2">
        <div className="px-2 py-1.5 font-medium text-sm">
          {t('manage_labels')}
        </div>
        <div className="max-h-64 overflow-y-auto">
          {labels.map((label) => (
            <div
              className="flex items-center gap-2 rounded-lg px-2 py-1"
              key={label.id}
            >
              <span
                className="size-2.5 shrink-0 rounded-full bg-foreground/30"
                style={
                  label.color ? { backgroundColor: label.color } : undefined
                }
              />
              <span className="min-w-0 flex-1 truncate text-sm">
                {label.name}
              </span>
              <Button
                aria-label={t('add_label_name', { name: label.name })}
                disabled={update.isPending}
                onClick={() =>
                  update.mutate({ action: 'add_label', labelId: label.id })
                }
                size="icon"
                variant="ghost"
              >
                <Plus className="size-3.5" />
              </Button>
              <Button
                aria-label={t('remove_label_name', { name: label.name })}
                disabled={update.isPending}
                onClick={() =>
                  update.mutate({ action: 'remove_label', labelId: label.id })
                }
                size="icon"
                variant="ghost"
              >
                <X className="size-3.5" />
              </Button>
            </div>
          ))}
          {!organization.isLoading && labels.length === 0 ? (
            <p className="px-2 py-3 text-muted-foreground text-xs">
              {t('no_custom_labels')}
            </p>
          ) : null}
        </div>
        <div className="mt-2 border-dynamic border-t pt-2">
          <Button
            className="w-full justify-start"
            disabled={
              smart.isPending || !labels.some((label) => label.aiEnabled)
            }
            onClick={() => smart.mutate()}
            size="sm"
            variant="ghost"
          >
            {smart.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Bot className="size-4" />
            )}
            {t('apply_smart_labels')}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
