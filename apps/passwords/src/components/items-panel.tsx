import { Download, Eye } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tuturuuu/ui/table';
import { useState } from 'react';
import { useI18n } from '../i18n/provider';
import { base64ToBytes } from '../lib/bytes';
import { saveBytes } from '../lib/save-file';
import { useSecretLease } from '../lib/secret-lease';
import type { PasswordsClientError } from '../service/client-error';
import { revealItem } from '../service/functions';
import type { ItemSummary, VaultDetail } from '../service/port';
import { PutItemDialog } from './put-item-dialog';
import { RevealDialog } from './reveal-dialog';
import { StepUpNotice } from './step-up-notice';
import { useGuardedMutation } from './use-guarded-mutation';

interface Props {
  wsId: string;
  vault: VaultDetail;
  stepUpUrl: string;
}

interface RevealArgs {
  item: ItemSummary;
  mode: 'reveal' | 'download';
}

export function formatBytes(count: number) {
  if (count < 1024) return `${count} B`;
  return count < 1024 * 1024
    ? `${(count / 1024).toFixed(1)} KiB`
    : `${(count / (1024 * 1024)).toFixed(1)} MiB`;
}

export function ItemsPanel({ wsId, vault, stepUpUrl }: Props) {
  const { t, locale } = useI18n();
  const { lease, hold, release } = useSecretLease();
  const [stepUp, setStepUp] = useState<string | null>(null);
  const canWrite =
    vault.summary.role !== 'viewer' && !vault.summary.rotationRequired;
  const showSizes = vault.items.some((item) => item.byteLength !== undefined);
  const showDates = vault.items.some((item) => item.updatedAt !== undefined);
  const onError = (error: PasswordsClientError) =>
    setStepUp(
      error.code === 'STEP_UP_REQUIRED' ? (error.stepUpUrl ?? stepUpUrl) : null
    );

  const reveal = useGuardedMutation({
    intent: ({ item, mode }: RevealArgs) =>
      `${item.id}:${item.version}:${mode}`,
    run: (args, requestId) =>
      revealItem({
        data: {
          wsId,
          vaultId: vault.summary.id,
          itemId: args.item.id,
          requestId,
        },
      }),
    reload: false,
  });

  const open = ({ item, mode }: RevealArgs) =>
    reveal.mutate(
      { item, mode },
      {
        onError,
        onSuccess: ({ base64 }) => {
          setStepUp(null);
          const bytes = base64ToBytes(base64);
          if (mode === 'reveal') hold(item.id, item.name, bytes);
          else {
            saveBytes(bytes, item.name);
            bytes.fill(0);
          }
          reveal.reset();
        },
      }
    );

  const dateFormat = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return (
    <div className="grid gap-4">
      {stepUp && <StepUpNotice url={stepUp} />}
      {canWrite && (
        <div className="flex justify-end">
          <PutItemDialog wsId={wsId} vault={vault.summary} onError={onError} />
        </div>
      )}
      {vault.items.length === 0 ? (
        <p className="py-10 text-center text-muted-foreground text-sm">
          {t('items.empty')}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('items.label')}</TableHead>
              <TableHead>{t('items.version')}</TableHead>
              {showSizes && <TableHead>{t('items.size')}</TableHead>}
              {showDates && <TableHead>{t('items.updated')}</TableHead>}
              <TableHead className="w-0" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {vault.items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{item.name}</TableCell>
                <TableCell>{item.version}</TableCell>
                {showSizes && (
                  <TableCell>
                    {item.byteLength === undefined
                      ? '—'
                      : formatBytes(item.byteLength)}
                  </TableCell>
                )}
                {showDates && (
                  <TableCell>
                    {item.updatedAt
                      ? dateFormat.format(new Date(item.updatedAt))
                      : '—'}
                  </TableCell>
                )}
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={
                        reveal.isPending || vault.summary.rotationRequired
                      }
                      onClick={() => open({ item, mode: 'reveal' })}
                    >
                      <Eye className="h-4 w-4" />
                      {t('items.reveal')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={
                        reveal.isPending || vault.summary.rotationRequired
                      }
                      onClick={() => open({ item, mode: 'download' })}
                    >
                      <Download className="h-4 w-4" />
                      {t('items.download')}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <RevealDialog lease={lease} onClose={release} />
    </div>
  );
}
