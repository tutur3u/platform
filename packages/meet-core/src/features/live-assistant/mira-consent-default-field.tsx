'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SquareCheck } from '@tuturuuu/icons';
import {
  getMiraConsentDefault,
  type MiraConsentDefault,
  updateMiraConsentDefault,
} from '@tuturuuu/internal-api/workspace-configs';
import { Label } from '@tuturuuu/ui/label';
import { toast } from '@tuturuuu/ui/sonner';
import { Switch } from '@tuturuuu/ui/switch';
import { useTranslations } from 'next-intl';
import { SettingsField } from '../../../../ui/src/components/ui/custom/settings-field';

const key = (wsId: string) => ['meet-mira-consent-default', wsId];

/**
 * Workspace setting: whether the Mira consent box starts ticked. Shown only
 * to workspace settings managers; each change is recorded with its actor and
 * applies to joins after the change.
 */
export function MiraConsentDefaultField({ wsId }: { wsId: string }) {
  const t = useTranslations('meet.mira_consent');
  const client = useQueryClient();
  const query = useQuery({
    queryKey: key(wsId),
    queryFn: () => getMiraConsentDefault(wsId),
    retry: false,
  });
  const save = useMutation({
    mutationFn: (next: boolean) => updateMiraConsentDefault(wsId, next),
    onSuccess: (next: MiraConsentDefault) =>
      client.setQueryData(key(wsId), next),
    onError: () => toast.error(t('default_failed')),
  });
  if (!query.data) return null;
  return (
    <SettingsField
      icon={<SquareCheck className="size-4" />}
      label={t('default_toggle')}
      description={t('default_effect')}
      layout="compact"
    >
      {(field) => (
        <Label
          htmlFor={field.id}
          className="-my-3 flex min-h-11 min-w-11 cursor-pointer items-center justify-end"
        >
          <Switch
            {...field}
            checked={
              save.isPending ? save.variables : query.data.boxTickedByDefault
            }
            disabled={save.isPending}
            onCheckedChange={(next) => save.mutate(next)}
          />
        </Label>
      )}
    </SettingsField>
  );
}
