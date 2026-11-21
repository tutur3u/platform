'use client';

import {
  type DeployAction,
  type DeployEnvironmentName,
  type DeployRecord,
  isDeployUrl,
} from '@tuturuuu/internal-api/infrastructure';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@tuturuuu/ui/alert-dialog';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { type RecordAction, shortSha } from './deployment-view';

export type PendingAction =
  | {
      environment: DeployEnvironmentName;
      action: RecordAction;
      record: DeployRecord;
    }
  | { environment: DeployEnvironmentName; action: 'release-hold'; lane: string }
  | { environment: DeployEnvironmentName; action: 'stop' | 'resume' };

const DESTRUCTIVE = new Set<PendingAction['action']>([
  'rollback',
  'cancel',
  'stop',
]);

export function DeploymentActionDialog({
  pending,
  submitting,
  onClose,
  onSubmit,
}: {
  pending: PendingAction | null;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (environment: DeployEnvironmentName, action: DeployAction) => void;
}) {
  return (
    <AlertDialog
      open={pending !== null}
      onOpenChange={(open) => !open && !submitting && onClose()}
    >
      <AlertDialogContent>
        {pending && (
          // Keyed so each opened action starts from empty inputs.
          <ActionForm
            key={`${pending.environment}:${pending.action}:${'record' in pending ? pending.record.id : ''}`}
            pending={pending}
            submitting={submitting}
            onSubmit={onSubmit}
          />
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ActionForm({
  pending,
  submitting,
  onSubmit,
}: {
  pending: PendingAction;
  submitting: boolean;
  onSubmit: (environment: DeployEnvironmentName, action: DeployAction) => void;
}) {
  const t = useTranslations('deployments');
  const [reason, setReason] = useState('');
  const [outcome, setOutcome] = useState<'succeeded' | 'failed'>('succeeded');
  const [url, setUrl] = useState('');
  const subject =
    'record' in pending
      ? shortSha(pending.record.sha)
      : pending.action === 'release-hold'
        ? pending.lane
        : t(`environments.${pending.environment}`);

  const build = (): DeployAction | null => {
    switch (pending.action) {
      case 'promote':
      case 'rollback':
      case 'cancel':
        return { action: pending.action, deploymentId: pending.record.id };
      case 'resolve':
        return {
          action: 'resolve',
          deploymentId: pending.record.id,
          outcome,
          url: url.trim() || null,
        };
      case 'release-hold':
        return { action: 'release-hold', lane: pending.lane };
      case 'stop':
        return reason.trim() ? { action: 'stop', reason: reason.trim() } : null;
      case 'resume':
        return { action: 'resume' };
    }
  };
  const action = build();
  const urlInvalid = url.trim() !== '' && !isDeployUrl(url.trim());

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (action && !urlInvalid) onSubmit(pending.environment, action);
      }}
    >
      <AlertDialogHeader>
        <AlertDialogTitle>
          {t(`confirm.${pending.action}.title`, { subject })}
        </AlertDialogTitle>
        <AlertDialogDescription>
          {t(`confirm.${pending.action}.description`)}
        </AlertDialogDescription>
      </AlertDialogHeader>

      {pending.action === 'stop' && (
        <Label className="space-y-2">
          {t('stop_reason')}
          <Input
            required
            maxLength={200}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </Label>
      )}

      {pending.action === 'resolve' && (
        <div className="space-y-4">
          <Label className="space-y-2">
            {t('resolve_outcome')}
            <Select
              value={outcome}
              onValueChange={(value) =>
                setOutcome(value as 'succeeded' | 'failed')
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="succeeded">
                  {t('statuses.succeeded')}
                </SelectItem>
                <SelectItem value="failed">{t('statuses.failed')}</SelectItem>
              </SelectContent>
            </Select>
          </Label>
          <Label className="space-y-2">
            {t('resolve_url')}
            <Input
              type="url"
              inputMode="url"
              placeholder="https://"
              aria-invalid={urlInvalid}
              value={url}
              onChange={(event) => setUrl(event.target.value)}
            />
          </Label>
        </div>
      )}

      <AlertDialogFooter>
        <AlertDialogCancel disabled={submitting}>
          {t('cancel')}
        </AlertDialogCancel>
        <Button
          type="submit"
          variant={DESTRUCTIVE.has(pending.action) ? 'destructive' : 'default'}
          disabled={!action || urlInvalid || submitting}
        >
          {t(`actions.${pending.action}`)}
        </Button>
      </AlertDialogFooter>
    </form>
  );
}
