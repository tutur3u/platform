'use client';
import type { EmployeeRejectionRecoveryState } from '@tuturuuu/internal-api/infrastructure';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import type { EmployeeCreationRecovery } from './employee-creation-recovery';

export function EmployeeRejectionRecoveryPanel({
  recovery,
  onReady,
}: {
  recovery: EmployeeCreationRecovery;
  onReady(): void;
}) {
  const t = useTranslations('internal-accounts.rejected_creation');
  const id = useId();
  const [candidate, setCandidate] =
    useState<EmployeeRejectionRecoveryState | null>(null);
  const [digest, setDigest] = useState('');
  const [attested, setAttested] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  async function run(adjudicate: boolean) {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      const state =
        adjudicate &&
        candidate?.status === 'eligible' &&
        attested &&
        /^[a-f0-9]{64}$/.test(digest)
          ? await recovery.adjudicateRejection(candidate, digest)
          : await recovery.inspectRejection();
      recovery.assertActive();
      setCandidate(state);
      if (state.status === 'eligible') {
        setDigest(recovery.reference?.rejection?.evidenceReferenceSha256 ?? '');
        setAttested(false);
      }
      if (state.status === 'retry_ready') onReady();
    } catch {
      try {
        recovery.assertActive();
        setCandidate(null);
        setAttested(false);
        setFailed(true);
      } catch {
        /* Retired surface cannot publish state. */
      }
    } finally {
      try {
        recovery.assertActive();
        setBusy(false);
      } catch {
        /* Retired. */
      }
    }
  }
  return (
    <div className="space-y-3 border-t pt-3">
      <p className="text-muted-foreground text-sm">{t('description')}</p>
      <Button
        type="button"
        variant="outline"
        disabled={busy}
        onClick={() => void run(false)}
      >
        {t('inspect')}
      </Button>
      {candidate?.status === 'eligible' ? (
        <>
          <p className="break-all text-sm">
            {t('identity', {
              operation: candidate.operationId,
              target: candidate.targetUserId,
              email: candidate.email,
              name: candidate.displayName,
            })}
          </p>
          <Label htmlFor={`${id}-digest`}>{t('evidence')}</Label>
          <Input
            id={`${id}-digest`}
            value={digest}
            onChange={(event) => setDigest(event.target.value)}
            maxLength={64}
            autoComplete="off"
            disabled={busy || Boolean(recovery.reference?.rejection)}
          />
          <Label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={attested}
              onChange={(event) => setAttested(event.target.checked)}
              disabled={busy}
            />
            {t('attestation')}
          </Label>
          <Button
            type="button"
            disabled={busy || !attested || !/^[a-f0-9]{64}$/.test(digest)}
            onClick={() => void run(true)}
          >
            {t('adjudicate')}
          </Button>
        </>
      ) : null}
      {candidate?.status === 'fenced' ||
      (recovery.reference?.state === 'adjudicating' &&
        candidate?.status !== 'eligible') ? (
        <p>{t('fenced')}</p>
      ) : null}
      {failed ? (
        <p role="alert" className="text-destructive text-sm">
          {t('unconfirmed')}
        </p>
      ) : null}
    </div>
  );
}
