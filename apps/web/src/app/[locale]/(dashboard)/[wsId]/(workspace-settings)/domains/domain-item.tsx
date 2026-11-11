'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  removeWorkspaceDomain,
  verifyWorkspaceDomain,
  type WorkspaceDomain,
  type WorkspaceDomainDnsRecord,
} from '@tuturuuu/internal-api/workspace-domains';
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
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { domainsKey, useDomainErrorMessage } from './shared';

const STATUS_VARIANT = {
  pending_verification: 'warning',
  verifying: 'secondary',
  active: 'success',
  suspended: 'error',
} as const;

const ROW_ERRORS = [
  'ownership_txt_missing',
  'dns_lookup_failed',
  'provider_not_configured',
  'entitlement_lapsed',
] as const;

function RecordTable({
  records,
  label,
}: {
  records: WorkspaceDomainDnsRecord[];
  label: string;
}) {
  const t = useTranslations('workspace-domains');
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-left text-sm" aria-label={label}>
        <thead className="text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">{t('dns.type')}</th>
            <th className="px-3 py-2 font-medium">{t('dns.name')}</th>
            <th className="px-3 py-2 font-medium">{t('dns.value')}</th>
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <tr
              key={`${record.type}:${record.name}:${record.value}`}
              className="border-t"
            >
              <td className="px-3 py-2 font-mono">{record.type}</td>
              <td className="select-all break-all px-3 py-2 font-mono">
                {record.name}
              </td>
              <td className="select-all break-all px-3 py-2 font-mono">
                {record.value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DomainItem({
  wsId,
  domain,
  canManage,
}: {
  wsId: string;
  domain: WorkspaceDomain;
  canManage: boolean;
}) {
  const t = useTranslations('workspace-domains');
  const cache = useQueryClient();
  const errorMessage = useDomainErrorMessage();
  const [confirming, setConfirming] = useState(false);
  const refresh = () => cache.invalidateQueries({ queryKey: domainsKey(wsId) });
  const verify = useMutation({
    mutationFn: () => verifyWorkspaceDomain(wsId, domain.id),
    onSettled: refresh,
  });
  const remove = useMutation({
    mutationFn: () => removeWorkspaceDomain(wsId, domain.id),
    onSuccess: async () => {
      setConfirming(false);
      await refresh();
    },
  });

  const customerRecords: WorkspaceDomainDnsRecord[] = [
    ...(domain.routingRecord ? [domain.routingRecord] : []),
    ...(domain.ownershipRecord ? [domain.ownershipRecord] : []),
    ...(Array.isArray(domain.providerRecords) ? domain.providerRecords : []),
  ];
  const rowError = ROW_ERRORS.find((code) => code === domain.error);
  const busy = verify.isPending || remove.isPending;

  return (
    <div className="space-y-3 px-4 py-4 md:px-5" data-slot="settings-row">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="break-all font-medium text-sm">
              {domain.hostname}
            </span>
            <Badge variant={STATUS_VARIANT[domain.status]}>
              {t(`status.${domain.status}`)}
            </Badge>
            {domain.entitlementSource === 'staff_bypass' && (
              <Badge variant="outline">{t('staffBadge')}</Badge>
            )}
          </div>
          {domain.status === 'active' ? (
            <a
              className="text-muted-foreground text-sm underline-offset-4 hover:underline"
              href={`https://${domain.hostname}`}
              rel="noopener noreferrer"
              target="_blank"
            >
              {t('visit')}
            </a>
          ) : null}
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => verify.mutate()}
            >
              {verify.isPending ? t('checking') : t('check')}
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => setConfirming(true)}
            >
              {t('remove')}
            </Button>
          </div>
        )}
      </div>

      {rowError && (
        <p className="text-muted-foreground text-sm">
          {t(`rowErrors.${rowError}`)}
        </p>
      )}
      {(verify.error || remove.error) && (
        <p role="alert" className="text-dynamic-red text-sm">
          {errorMessage(verify.error ?? remove.error)}
        </p>
      )}

      {domain.kind === 'custom' && domain.status !== 'active' && (
        <div className="space-y-2">
          <p className="text-muted-foreground text-sm">{t('dns.help')}</p>
          <RecordTable records={customerRecords} label={t('dns.title')} />
        </div>
      )}

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('removeTitle', { hostname: domain.hostname })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('removeDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>
              {t('cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={remove.isPending}
              onClick={(event) => {
                event.preventDefault();
                remove.mutate();
              }}
            >
              {t('confirmRemove')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
