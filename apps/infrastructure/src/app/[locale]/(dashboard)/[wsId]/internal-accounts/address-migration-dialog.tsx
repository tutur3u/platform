'use client';

import { useMutation } from '@tanstack/react-query';
import {
  inspectInternalEmployeeAddressMigration,
  migrateInternalEmployeeAddress,
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
} from './address-migration-session';

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
  const [sourceConfirmation, setSourceConfirmation] = useState('');
  const [destinationConfirmation, setDestinationConfirmation] = useState('');
  const [view, setView] = useState<MigrationView>({ kind: 'editing' });
  function makeSession() {
    return new AddressMigrationSession({
      inspect: inspectInternalEmployeeAddressMigration,
      migrate: migrateInternalEmployeeAddress,
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
  const editable = !tuple && view.kind !== 'busy';
  function changeOpen(next: boolean) {
    if (busy) return;
    if (next) session.recover();
    setOpen(next);
    setSourceConfirmation('');
    setDestinationConfirmation('');
  }
  function inspect() {
    const parsed = createMigrationTuple(userId, source);
    const target = tuple ?? (parsed.success ? parsed.data : null);
    if (target) action.mutate(() => session.inspect(target));
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
          {view.kind === 'ready' ? (
            <div className="space-y-2">
              <p className="text-sm">{t('ready')}</p>
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
          {view.kind === 'pending' ? (
            <output className="block text-sm">{t('pending')}</output>
          ) : null}
          {view.kind === 'completed' ? (
            <output className="block text-sm">{t('completed')}</output>
          ) : null}
          {busy ? <output>{t('working')}</output> : null}
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
              disabled={
                busy ||
                (!tuple && !createMigrationTuple(userId, source).success)
              }
              onClick={inspect}
            >
              {t('inspect')}
            </Button>
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
