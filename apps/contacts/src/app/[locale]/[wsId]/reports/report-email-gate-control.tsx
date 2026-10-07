'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateWorkspaceFeatureSecret } from '@tuturuuu/internal-api/workspace-configs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@tuturuuu/ui/alert-dialog';
import { Button } from '@tuturuuu/ui/button';
import { useWorkspaceActor } from '@tuturuuu/ui/hooks/use-workspace-visibility';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

type Intent = {
  enabled: boolean;
  wsId: string;
  actor: NonNullable<ReturnType<typeof useWorkspaceActor>>;
};
export function ReportEmailGateControl({
  wsId,
  enabled,
  canConfigure,
}: {
  wsId: string;
  enabled: boolean;
  canConfigure: boolean;
}) {
  const t = useTranslations('reports-hub');
  const client = useQueryClient();
  const actor = useWorkspaceActor();
  const current = useRef({ wsId, actor, canConfigure });
  current.current = { wsId, actor, canConfigure };
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [intent, setIntent] = useState<Intent | null>(null);
  function assertCurrent(value: Intent) {
    value.actor.assertActive();
    if (
      !mounted.current ||
      current.current.wsId !== value.wsId ||
      current.current.actor !== value.actor ||
      !current.current.canConfigure
    )
      throw new Error('Report configuration changed');
  }
  const mutation = useMutation({
    mutationFn: async (value: Intent) => {
      assertCurrent(value);
      const result = await updateWorkspaceFeatureSecret(
        value.wsId,
        'ENABLE_REPORT_EMAIL_SENDING',
        value.enabled
      );
      assertCurrent(value);
      return result;
    },
    onSuccess: async (_, value) => {
      assertCurrent(value);
      setIntent(null);
      toast.success(t('report_email_gate_saved'));
      await Promise.all([
        client.invalidateQueries({
          queryKey: ['periodic-report-schedules', value.wsId],
        }),
        client.invalidateQueries({
          queryKey: ['periodic-reports', value.wsId],
        }),
        client.invalidateQueries({
          queryKey: ['periodic-report-delivery', value.wsId],
        }),
      ]);
    },
    onError: (_, value) => {
      try {
        assertCurrent(value);
      } catch {
        return;
      }
      toast.error(t('report_email_gate_failed'));
    },
  });
  if (!canConfigure || !actor) return null;
  return (
    <div className="space-y-2 md:col-span-2">
      <Button
        variant="outline"
        disabled={mutation.isPending}
        onClick={() => {
          const value = { enabled: !enabled, wsId, actor };
          try {
            assertCurrent(value);
            setIntent(value);
          } catch {
            toast.error(t('report_email_gate_failed'));
          }
        }}
      >
        {t(enabled ? 'report_email_disable' : 'report_email_enable')}
      </Button>
      <p className="text-muted-foreground text-xs">
        {t('report_email_gate_description')}
      </p>
      <AlertDialog
        open={intent !== null}
        onOpenChange={(open) => !open && !mutation.isPending && setIntent(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t(
                intent?.enabled ? 'report_email_enable' : 'report_email_disable'
              )}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('report_email_gate_confirmation')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutation.isPending}>
              {t('cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={intent === null || mutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (!intent) return;
                try {
                  assertCurrent(intent);
                  mutation.mutate(intent);
                } catch {
                  setIntent(null);
                  toast.error(t('report_email_gate_failed'));
                }
              }}
            >
              {t('report_email_confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
