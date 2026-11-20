'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RotateCcw, ShieldCheck } from '@tuturuuu/icons';
import {
  getMiraAudienceAttestation,
  type MiraAudienceAttestation,
  updateMiraAudienceAttestation,
} from '@tuturuuu/internal-api/workspace-configs';
import { useFormatter, useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../alert-dialog';
import { Button } from '../button';
import { toast } from '../sonner';
import { Switch } from '../switch';
import { SettingItemTab } from './settings-item-tab';
import { SettingsSection } from './settings-section';

const queryKey = (wsId: string) => ['mira-audience-attestation', wsId];

/**
 * Workspace 18+ audience attestation for Meet Mira. Render only for workspace
 * settings managers; the API rechecks the permission on every read and write.
 */
export function MiraAudienceSettings({ wsId }: { wsId: string }) {
  const t = useTranslations('ws-settings');
  const tCommon = useTranslations('common');
  const format = useFormatter();
  const switchId = useId();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const attestation = useQuery({
    queryKey: queryKey(wsId),
    queryFn: () => getMiraAudienceAttestation(wsId),
    retry: false,
  });
  const update = useMutation({
    mutationFn: (attested: boolean) =>
      updateMiraAudienceAttestation(wsId, attested),
    onSuccess: (data: MiraAudienceAttestation) => {
      queryClient.setQueryData(queryKey(wsId), data);
      setConfirming(false);
      toast.success(t('mira_audience_saved'));
    },
    onError: () => toast.error(t('mira_audience_failed')),
  });

  const attested = attestation.data?.attested === true;
  const attestedAt = attestation.data?.attestedAt;
  const description = attestation.isError
    ? t('mira_audience_load_failed')
    : attested && attestedAt
      ? t('mira_audience_attested_at', {
          date: format.dateTime(new Date(attestedAt), { dateStyle: 'medium' }),
        })
      : t('mira_audience_description');

  return (
    <SettingsSection title={t('mira_audience_title')}>
      <SettingItemTab
        icon={<ShieldCheck className="size-4" />}
        title={<label htmlFor={switchId}>{t('mira_audience_toggle')}</label>}
        description={description}
      >
        {attestation.isError ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => void attestation.refetch()}
          >
            <RotateCcw className="size-4" />
            {tCommon('retry')}
          </Button>
        ) : (
          <Switch
            id={switchId}
            checked={attested}
            disabled={attestation.isPending || update.isPending}
            onCheckedChange={(next) =>
              next ? setConfirming(true) : update.mutate(false)
            }
          />
        )}
      </SettingItemTab>
      <AlertDialog
        open={confirming}
        onOpenChange={(open) => !update.isPending && setConfirming(open)}
      >
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('mira_audience_confirm_title')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('mira_audience_confirm_description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={update.isPending}>
              {tCommon('cancel')}
            </AlertDialogCancel>
            <Button
              disabled={update.isPending}
              onClick={() => update.mutate(true)}
            >
              <ShieldCheck className="size-4" />
              {t('mira_audience_confirm')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsSection>
  );
}
