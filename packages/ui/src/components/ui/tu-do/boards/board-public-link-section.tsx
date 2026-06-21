'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Copy,
  ExternalLink,
  Globe2,
  Info,
  Loader2,
  Trash2,
} from '@tuturuuu/icons';
import {
  disableWorkspaceTaskBoardPublicLink,
  enableWorkspaceTaskBoardPublicLink,
  getWorkspaceTaskBoardPublicLink,
  type WorkspaceTaskBoardPublicLink,
} from '@tuturuuu/internal-api/tasks';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';

interface BoardPublicLinkSectionProps {
  boardId: string;
  open: boolean;
  wsId: string;
}

function buildPublicBoardUrl(
  locale: string,
  link: WorkspaceTaskBoardPublicLink | null
) {
  if (!link?.code) return '';

  const path = `/${locale}/shared/task-boards/${link.code}`;
  if (typeof window === 'undefined') return path;
  return `${window.location.origin}${path}`;
}

export function BoardPublicLinkSection({
  boardId,
  open,
  wsId,
}: BoardPublicLinkSectionProps) {
  const t = useTranslations();
  const locale = useLocale();
  const queryClient = useQueryClient();
  const queryKey = ['task-board-public-link', wsId, boardId] as const;

  const publicLinkQuery = useQuery({
    queryKey,
    queryFn: () => getWorkspaceTaskBoardPublicLink(wsId, boardId),
    enabled: open,
  });

  const enableMutation = useMutation({
    mutationFn: () => enableWorkspaceTaskBoardPublicLink(wsId, boardId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
      toast.success(t('ws-task-boards.share.public.enabled'));
    },
    onError: () => {
      toast.error(t('ws-task-boards.share.public.enable_failed'));
    },
  });

  const disableMutation = useMutation({
    mutationFn: () => disableWorkspaceTaskBoardPublicLink(wsId, boardId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
      toast.success(t('ws-task-boards.share.public.disabled'));
    },
    onError: () => {
      toast.error(t('ws-task-boards.share.public.disable_failed'));
    },
  });

  const publicLink = publicLinkQuery.data?.publicLink ?? null;
  const publicUrl = buildPublicBoardUrl(locale, publicLink);
  const isMutating = enableMutation.isPending || disableMutation.isPending;

  async function copyPublicUrl() {
    if (!publicUrl) return;

    try {
      await navigator.clipboard.writeText(publicUrl);
      toast.success(t('ws-task-boards.share.public.copy_success'));
    } catch {
      toast.error(t('ws-task-boards.share.public.copy_failed'));
    }
  }

  function openPublicUrl() {
    if (!publicUrl || typeof window === 'undefined') return;
    window.open(publicUrl, '_blank', 'noopener,noreferrer');
  }

  return (
    <section className="space-y-3 rounded-md border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2 font-medium text-sm">
            <Globe2 className="h-4 w-4 text-muted-foreground" />
            {t('ws-task-boards.share.public.title')}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="text-muted-foreground transition-colors hover:text-foreground"
                    aria-label={t('ws-task-boards.share.note')}
                  >
                    <Info className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  {t('ws-task-boards.share.public.tooltip')}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <p className="text-muted-foreground text-sm">
            {t('ws-task-boards.share.public.description')}
          </p>
        </div>
        {publicLink && (
          <Badge variant="secondary">
            {t('ws-task-boards.share.public.active')}
          </Badge>
        )}
      </div>

      {publicLinkQuery.isLoading ? (
        <div className="flex items-center gap-2 rounded-md border border-dashed p-3 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('common.loading')}
        </div>
      ) : publicLink ? (
        <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
          <Input value={publicUrl} readOnly className="min-w-0" />
          <Button
            type="button"
            variant="outline"
            onClick={copyPublicUrl}
            disabled={!publicUrl}
          >
            <Copy className="h-4 w-4" />
            {t('ws-task-boards.share.public.copy')}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={openPublicUrl}
            disabled={!publicUrl}
          >
            <ExternalLink className="h-4 w-4" />
            {t('ws-task-boards.share.public.open')}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => disableMutation.mutate()}
            disabled={isMutating}
          >
            {disableMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            {t('ws-task-boards.share.public.disable')}
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          onClick={() => enableMutation.mutate()}
          disabled={isMutating}
        >
          {enableMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Globe2 className="h-4 w-4" />
          )}
          {t('ws-task-boards.share.public.enable')}
        </Button>
      )}
    </section>
  );
}
