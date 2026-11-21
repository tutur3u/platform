'use client';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { useTranslations } from 'next-intl';
import { useId, useRef, useState } from 'react';
import type {
  CreationReference,
  EmployeeCreationRecovery,
} from './employee-creation-recovery';

export function EmployeeOriginalOperationResume({
  recovery,
  onResume,
  onBusyChange,
}: {
  recovery: EmployeeCreationRecovery;
  onResume(reference: CreationReference): void;
  onBusyChange(busy: boolean): void;
}) {
  const t = useTranslations('internal-accounts.original_creation');
  const id = useId();
  const pending = useRef(false);
  const [operation, setOperation] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  async function load() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    onBusyChange(true);
    setFailed(false);
    try {
      const reference = await recovery.resumeOriginal(operation.trim());
      recovery.assertActive();
      onResume(reference);
    } catch {
      try {
        recovery.assertActive();
        setFailed(true);
      } catch {
        /* Retired. */
      }
    } finally {
      pending.current = false;
      try {
        recovery.assertActive();
        setBusy(false);
        onBusyChange(false);
      } catch {
        /* Retired. */
      }
    }
  }
  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">{t('description')}</p>
      <Label htmlFor={id}>{t('operation')}</Label>
      <Input
        id={id}
        value={operation}
        onChange={(event) => setOperation(event.target.value)}
        disabled={busy}
        autoComplete="off"
      />
      <Button
        type="button"
        variant="outline"
        disabled={busy || !operation.trim()}
        onClick={() => void load()}
      >
        {t('load')}
      </Button>
      {failed ? (
        <p role="alert" className="text-destructive text-sm">
          {t('unavailable')}
        </p>
      ) : null}
    </div>
  );
}
