'use client';

import { useMutation } from '@tanstack/react-query';
import {
  inspectInternalEmployeeAddressMigration,
  migrateInternalEmployeeAddress,
  prepareInternalEmployeeAddressMigration,
} from '@tuturuuu/internal-api/infrastructure';
import { Alert, AlertDescription } from '@tuturuuu/ui/alert';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { useWorkspaceActor } from '@tuturuuu/ui/hooks/use-workspace-visibility';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useState } from 'react';
import {
  AddressMigrationSession,
  createMigrationTuple,
  type MigrationView,
  validMigrationInput,
} from './address-migration-session';

import { RetainedMailboxAdoption } from './retained-mailbox-adoption';

const lifetimeIds = new WeakMap<object, number>();
let nextLifetimeId = 0;
function lifetimeId(lifetime: object) {
  const existing = lifetimeIds.get(lifetime);
  if (existing !== undefined) return existing;
  const id = ++nextLifetimeId;
  lifetimeIds.set(lifetime, id);
  return id;
}

export function AddressMigrationDialog({
  actorId,
  workspaceId,
}: {
  actorId: string;
  workspaceId: string;
}) {
  const actor = useWorkspaceActor();
  const params = useParams<{ wsId: string }>();
  if (!actor || actor.actorId !== actorId || params.wsId !== workspaceId)
    return null;
  return (
    <ScopedMigrationDialog
      key={`${actorId}:${workspaceId}:${lifetimeId(actor.lifetime)}`}
      actorId={actorId}
      workspaceId={workspaceId}
      assertActorActive={actor.assertActive}
    />
  );
}

function ScopedMigrationDialog({
  actorId,
  workspaceId,
  assertActorActive,
}: {
  actorId: string;
  workspaceId: string;
  assertActorActive(): void;
}) {
  const t = useTranslations('internal-accounts.address_migration');
  const id = useId();
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState('');
  const [source, setSource] = useState('');
  const [operationId, setOperationId] = useState('');
  const [targetConfirmation, setTargetConfirmation] = useState('');
  const [sourceConfirmation, setSourceConfirmation] = useState('');
  const [destinationConfirmation, setDestinationConfirmation] = useState('');
  const [view, setView] = useState<MigrationView>({ kind: 'editing' });
  function makeSession() {
    return new AddressMigrationSession({
      inspect: inspectInternalEmployeeAddressMigration,
      migrate: migrateInternalEmployeeAddress,
      prepare: prepareInternalEmployeeAddressMigration,
      assertActive: assertActorActive,
      storage: {
        getItem: (key) => sessionStorage.getItem(key),
        setItem: (key, value) => sessionStorage.setItem(key, value),
      },
      storageKey: `infra:address-migration:v1:${actorId}:${workspaceId}`,
      changed: setView,
    });
  }
  const [session] = useState(makeSession);
  useEffect(() => {
    session.activate();
    return () => session.retire();
  }, [session]);
  const action = useMutation({
    mutationFn: async (work: () => Promise<void>) => work(),
    retry: false,
  });
  const tuple = 'tuple' in view ? view.tuple : undefined;
  const busy = action.isPending || view.kind === 'busy';
  const editable = view.kind === 'editing';
  const canPrepare = session.canPrepare();
  const validInput = validMigrationInput(userId, source, operationId);
  const confirmationsMatch =
    sourceConfirmation === (tuple?.sourceAddress ?? source) &&
    destinationConfirmation ===
      (tuple?.destinationAddress ??
        source.replace('@xwf.tuturuuu.com', '@tuturuuu.com'));
  function changeOpen(next: boolean) {
    if (busy) return;
    if (next) session.recover();
    setOpen(next);
    setTargetConfirmation('');
    setSourceConfirmation('');
    setDestinationConfirmation('');
  }
  function targetTuple() {
    if (tuple) return tuple;
    if (!editable || !validInput) return null;
    const parsed = createMigrationTuple(
      userId,
      source,
      operationId || undefined
    );
    return parsed.success ? parsed.data : null;
  }
  function inspect() {
    const target = targetTuple();
    if (target) action.mutate(() => session.inspect(target));
    setSourceConfirmation('');
    setDestinationConfirmation('');
  }
  function prepare() {
    const target = targetTuple();
    if (target)
      action.mutate(() =>
        session.prepare(
          target,
          targetConfirmation,
          sourceConfirmation,
          destinationConfirmation
        )
      );
    setTargetConfirmation('');
    setSourceConfirmation('');
    setDestinationConfirmation('');
  }
  return (
    <section className="space-y-2 rounded-xl border bg-card p-4">
      <h2 className="font-semibold">{t('title')}</h2>
      <p className="max-w-3xl text-muted-foreground text-sm">
        {t('description')}
      </p>
      <Button type="button" variant="outline" onClick={() => changeOpen(true)}>
        {t('open')}
      </Button>
      <Dialog open={open} onOpenChange={changeOpen}>
        <DialogContent
          className="max-h-[90dvh] overflow-y-auto sm:max-w-xl"
          onEscapeKeyDown={(event) => {
            if (busy) event.preventDefault();
          }}
          onInteractOutside={(event) => {
            if (busy) event.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>{t('title')}</DialogTitle>
            <DialogDescription>{t('description')}</DialogDescription>
          </DialogHeader>
          <Alert>
            <AlertDescription>{t('mail_safeguard')}</AlertDescription>
          </Alert>
          <div className="space-y-2">
            <Label htmlFor={`${id}-operation`}>{t('operation_id')}</Label>
            <Input
              id={`${id}-operation`}
              value={tuple?.operationId ?? operationId}
              disabled={!editable}
              onChange={(event) => setOperationId(event.target.value)}
              autoComplete="off"
            />
            <p className="text-muted-foreground text-sm">
              {t('operation_help')}
            </p>
            <Label htmlFor={`${id}-user`}>{t('user_id')}</Label>
            <Input
              id={`${id}-user`}
              value={tuple?.userId ?? userId}
              disabled={!editable}
              onChange={(event) => setUserId(event.target.value)}
              autoComplete="off"
            />
            <Label htmlFor={`${id}-source`}>{t('source')}</Label>
            <Input
              id={`${id}-source`}
              value={tuple?.sourceAddress ?? source}
              disabled={!editable}
              onChange={(event) => setSource(event.target.value)}
              autoComplete="off"
            />
            <Label htmlFor={`${id}-destination`}>{t('destination')}</Label>
            <Input
              id={`${id}-destination`}
              readOnly
              value={
                tuple?.destinationAddress ??
                source.replace('@xwf.tuturuuu.com', '@tuturuuu.com')
              }
            />
          </div>
          {tuple ? (
            <p className="break-all font-mono text-xs">
              {t('receipt', {
                operationId: tuple.operationId,
                revision: tuple.expectedRevision,
              })}
            </p>
          ) : null}
          {view.kind === 'ready' || canPrepare ? (
            <div className="space-y-2">
              <p className="text-sm">
                {t(view.kind === 'ready' ? 'ready' : 'prepare_help')}
              </p>
              {canPrepare ? (
                <>
                  <Label htmlFor={`${id}-confirm-target`}>
                    {t('confirm_target')}
                  </Label>
                  <Input
                    id={`${id}-confirm-target`}
                    value={targetConfirmation}
                    onChange={(event) =>
                      setTargetConfirmation(event.target.value)
                    }
                    autoComplete="off"
                  />
                </>
              ) : null}
              <Label htmlFor={`${id}-confirm-source`}>
                {t('confirm_source')}
              </Label>
              <Input
                id={`${id}-confirm-source`}
                value={sourceConfirmation}
                onChange={(event) => setSourceConfirmation(event.target.value)}
                autoComplete="off"
              />
              <Label htmlFor={`${id}-confirm-destination`}>
                {t('confirm_destination')}
              </Label>
              <Input
                id={`${id}-confirm-destination`}
                value={destinationConfirmation}
                onChange={(event) =>
                  setDestinationConfirmation(event.target.value)
                }
                autoComplete="off"
              />
            </div>
          ) : null}
          {view.kind === 'denied' ? (
            <p role="alert" className="text-destructive text-sm">
              {t('denied')}
            </p>
          ) : null}
          {view.kind === 'frozen' || view.kind === 'prepared' ? (
            <output className="block text-sm">{t(view.kind)}</output>
          ) : null}
          {view.kind === 'pending' ? (
            <output className="block text-sm">{t('pending')}</output>
          ) : null}
          {view.kind === 'completed' ? (
            <output className="block text-sm">{t('completed')}</output>
          ) : null}
          {busy ? <output>{t('working')}</output> : null}
          {tuple &&
          !busy &&
          view.kind !== 'completed' &&
          view.kind !== 'ready' ? (
            <RetainedMailboxAdoption
              key={tuple.operationId}
              tuple={tuple}
              storageKey={`infra:retained-adoption:v1:${actorId}:${workspaceId}:${tuple.operationId}`}
              assertActive={assertActorActive}
              adopted={() => session.inspect(tuple)}
            />
          ) : null}
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => changeOpen(false)}
            >
              {t('close')}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy || (!tuple && (!editable || !validInput))}
              onClick={inspect}
            >
              {t('inspect')}
            </Button>
            {canPrepare ? (
              <Button
                type="button"
                variant="outline"
                disabled={
                  busy ||
                  (!tuple && !validInput) ||
                  !confirmationsMatch ||
                  targetConfirmation !== (tuple?.userId ?? userId)
                }
                onClick={prepare}
              >
                {t('prepare')}
              </Button>
            ) : null}
            {view.kind === 'ready' ? (
              <Button
                type="button"
                disabled={
                  busy ||
                  sourceConfirmation !== tuple?.sourceAddress ||
                  destinationConfirmation !== tuple?.destinationAddress
                }
                onClick={() =>
                  action.mutate(() =>
                    session.migrate(sourceConfirmation, destinationConfirmation)
                  )
                }
              >
                {t('migrate')}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
