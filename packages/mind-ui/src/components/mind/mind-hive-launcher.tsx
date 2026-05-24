'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { Loader2, Workflow } from '@tuturuuu/icons';
import {
  createHiveMindSimulation,
  listHiveServers,
} from '@tuturuuu/internal-api/hive';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';

type MindHiveLauncherProps = {
  boardId: string | null;
  disabled?: boolean;
  hiveHref: string;
  workspaceId: string;
};

export function MindHiveLauncher({
  boardId,
  disabled,
  hiveHref,
  workspaceId,
}: MindHiveLauncherProps) {
  const t = useTranslations('mind.hiveLauncher');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [serverId, setServerId] = useState('');
  const serversQuery = useQuery({
    enabled: open,
    queryFn: () => listHiveServers(),
    queryKey: ['hive', 'servers', 'mind-launcher'],
    staleTime: 30_000,
  });
  const servers = serversQuery.data?.servers ?? [];
  const isAdmin = serversQuery.data?.isAdmin ?? true;
  const selectedServer = servers.find((server) => server.id === serverId);
  const canLaunch =
    !!boardId &&
    !!selectedServer &&
    isAdmin &&
    !disabled &&
    !serversQuery.isLoading;
  const createSimulation = useMutation({
    mutationFn: () =>
      createHiveMindSimulation(serverId, {
        boardId: boardId ?? '',
        workspaceId,
      }),
    onError: () => {
      toast.error(t('errorToast'));
    },
    onSuccess: (response) => {
      toast.success(
        t('createdToast', {
          agents: response.summary.agents,
          pairs: response.summary.pairs,
        })
      );
      setOpen(false);
      router.push(
        buildHiveTargetHref(hiveHref, {
          panel: 'workflows',
          serverId,
          workflowId: response.workflow.id,
        })
      );
    },
  });
  const serverSummary = useMemo(() => {
    if (serversQuery.isLoading) return t('loadingServers');
    if (!servers.length) return t('noServers');
    return t('serverCount', { count: servers.length });
  }, [servers.length, serversQuery.isLoading, t]);

  useEffect(() => {
    if (!open || serverId || servers.length === 0) return;
    setServerId(servers[0]?.id ?? '');
  }, [open, serverId, servers]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          aria-label={t('open')}
          className="h-9 w-9 touch-manipulation"
          disabled={disabled || !boardId}
          size="icon"
          type="button"
          variant="ghost"
        >
          <Workflow className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <p className="text-muted-foreground text-sm">{t('description')}</p>
          <label className="grid gap-1.5">
            <span className="font-medium text-xs">{t('server')}</span>
            <Select
              disabled={serversQuery.isLoading || createSimulation.isPending}
              onValueChange={setServerId}
              value={serverId}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('serverPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {servers.map((server) => (
                  <SelectItem key={server.id} value={server.id}>
                    {server.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-muted-foreground text-xs">
            {isAdmin ? serverSummary : t('adminRequired')}
          </div>
        </div>
        <DialogFooter>
          <Button
            className="gap-2"
            disabled={!canLaunch || createSimulation.isPending}
            onClick={() => createSimulation.mutate()}
            type="button"
          >
            {createSimulation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Workflow className="h-4 w-4" />
            )}
            {t('launch')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function buildHiveTargetHref(
  hiveHref: string,
  params: { panel: string; serverId: string; workflowId: string }
) {
  const [path, search = ''] = hiveHref.split('?');
  const searchParams = new URLSearchParams(search);
  searchParams.set('panel', params.panel);
  searchParams.set('serverId', params.serverId);
  searchParams.set('workflowId', params.workflowId);
  return `${path}?${searchParams.toString()}`;
}
