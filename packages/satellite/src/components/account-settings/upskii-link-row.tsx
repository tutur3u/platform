'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Unlink } from '@tuturuuu/icons';
import {
  disconnectUpskiiLink,
  getUpskiiLinkStatus,
} from '@tuturuuu/internal-api/integrations';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@tuturuuu/ui/alert-dialog';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { toast } from '@tuturuuu/ui/sonner';
import { UPSKII_CONNECT_URL } from '@tuturuuu/utils/integrations-catalog';
import { useTranslations } from 'next-intl';

export const upskiiLinkQueryKey = ['integrations', 'upskii', 'link'] as const;

/** Link status and actions for the Upskii row of the Integrations tab. */
export function UpskiiLinkAction() {
  const t = useTranslations('account-integrations');
  const queryClient = useQueryClient();
  const status = useQuery({
    queryFn: () => getUpskiiLinkStatus(),
    queryKey: upskiiLinkQueryKey,
  });
  const disconnect = useMutation({
    mutationFn: () => disconnectUpskiiLink(),
    onError: () => toast.error(t('upskii_disconnect_failed')),
    onSuccess: async () => {
      toast.success(t('upskii_disconnected'));
      await queryClient.invalidateQueries({ queryKey: upskiiLinkQueryKey });
    },
  });

  if (status.isPending) {
    return <Skeleton aria-hidden="true" className="h-8 w-24" />;
  }

  if (status.isError) {
    return (
      <Button onClick={() => status.refetch()} size="sm" variant="outline">
        {t('retry')}
      </Button>
    );
  }

  const { canLink, link } = status.data;

  if (link) {
    return (
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Badge variant="default">{t('connected')}</Badge>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button disabled={disconnect.isPending} size="sm" variant="outline">
              <Unlink aria-hidden="true" className="size-3.5" />
              {t('disconnect')}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t('upskii_disconnect_title')}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t('upskii_disconnect_description')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
              <AlertDialogAction onClick={() => disconnect.mutate()}>
                {t('disconnect')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  if (!canLink) {
    return <Badge variant="secondary">{t('coming_soon')}</Badge>;
  }

  return (
    <Button asChild size="sm" variant="outline">
      <a href={UPSKII_CONNECT_URL} rel="noopener noreferrer" target="_blank">
        {t('connect')}
        <ExternalLink aria-hidden="true" className="size-3.5" />
      </a>
    </Button>
  );
}

/** The linked Upskii account, shown under the row title. */
export function useUpskiiLinkedEmail() {
  const status = useQuery({
    queryFn: () => getUpskiiLinkStatus(),
    queryKey: upskiiLinkQueryKey,
  });
  return status.data?.link?.upskiiEmail ?? null;
}
