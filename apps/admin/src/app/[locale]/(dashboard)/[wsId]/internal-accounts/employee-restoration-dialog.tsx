'use client';

import { useQuery } from '@tanstack/react-query';
import { EmployeeRestorationConsumer } from '@tuturuuu/internal-api/infrastructure';
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
import { useTranslations } from 'next-intl';
import { type FormEvent, useId, useLayoutEffect, useState } from 'react';
import { EmployeeRestorationDetails } from './employee-restoration-details';

class RestorationSession {
  private active = false;
  readonly consumer: EmployeeRestorationConsumer;
  constructor(
    private readonly actor: ReturnType<typeof useWorkspaceActor>,
    private readonly userId: string,
    private readonly email: string
  ) {
    this.consumer = new EmployeeRestorationConsumer({
      targetId: userId,
      email,
      assertActive: () => this.assertActive(),
    });
  }
  activate(
    actor: ReturnType<typeof useWorkspaceActor>,
    userId: string,
    email: string
  ) {
    this.active =
      actor === this.actor && userId === this.userId && email === this.email;
  }
  retire() {
    this.active = false;
  }
  assertActive() {
    if (!this.active || !this.actor)
      throw new Error('Management context retired');
    this.actor.assertActive();
  }
}

export function EmployeeRestorationDialog({
  userId,
  email,
  open,
  onOpenChange,
  onDirectoryRefresh,
}: {
  userId: string;
  email: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDirectoryRefresh?: () => Promise<unknown>;
}) {
  const actor = useWorkspaceActor();
  const [boundActor] = useState(actor);
  const [session] = useState(
    () => new RestorationSession(actor, userId, email)
  );
  useLayoutEffect(() => {
    session.activate(actor, userId, email);
    return () => session.retire();
  }, [session, actor, userId, email]);
  const consumer = session.consumer;
  const [, render] = useState(0);
  const [confirmation, setConfirmation] = useState('');
  const id = useId();
  const t = useTranslations('internal-accounts.restoration');
  const view = consumer.view;
  const action = consumer.action === 'restore' ? 'restore' : null;
  async function run(work: () => Promise<void>) {
    try {
      const wasRestored = consumer.view.outcome === 'restored';
      const pending = work();
      render((value) => value + 1);
      await pending;
      session.assertActive();
      if (!wasRestored && consumer.view.outcome === 'restored')
        await onDirectoryRefresh?.();
    } catch {
      // A retired actor's result must not be published into a replacement scope.
    } finally {
      try {
        session.assertActive();
        render((value) => value + 1);
      } catch {
        /* Retired scope. */
      }
    }
  }
  function changeOpen(next: boolean) {
    if (consumer.view.busy) return;
    setConfirmation('');
    onOpenChange(next);
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (action !== 'restore') return;
    void run(() => consumer.submit(confirmation));
  }

  let active = actor !== null && actor === boundActor;
  try {
    actor?.assertActive();
  } catch {
    active = false;
  }
  useQuery({
    queryKey: ['employee-restoration-readiness', id, userId, email],
    enabled: open && active,
    queryFn: async () => {
      await run(() => consumer.inspect());
      return null;
    },
    retry: false,
    gcTime: 0,
    staleTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  if (!active) return null;
  const detail = view.detail;
  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent
        showCloseButton={false}
        className="max-h-[90dvh] overflow-y-auto sm:max-w-lg"
        onEscapeKeyDown={(event) => {
          if (view.busy) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (view.busy) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description', { email })}</DialogDescription>
        </DialogHeader>
        <Alert>
          <AlertDescription>{t('migration_separate')}</AlertDescription>
        </Alert>
        {view.busy ? <output>{t('working')}</output> : null}
        {view.outcome !== 'idle' ? (
          <output>
            {t(
              view.outcome === 'conflict' && view.retained
                ? 'revision_conflict'
                : `outcomes.${view.outcome}`
            )}
          </output>
        ) : null}
        {['pending', 'conflict', 'unavailable'].includes(view.outcome) ||
        detail?.nextAction === 'inspect' ? (
          <Button
            type="button"
            variant="outline"
            disabled={view.busy}
            onClick={() => void run(() => consumer.inspect())}
          >
            {t('check_result')}
          </Button>
        ) : null}
        {detail && view.outcome !== 'pending' && view.outcome !== 'conflict' ? (
          <p aria-live="polite">{t(`next.${detail.nextAction}`)}</p>
        ) : null}
        <EmployeeRestorationDetails
          view={view}
          onInspect={() => void run(() => consumer.inspect())}
        />
        <form onSubmit={submit} className="space-y-4">
          {action ? (
            <div className="space-y-2">
              <Label htmlFor={`${id}-confirmation`}>{t('confirmation')}</Label>
              <Input
                id={`${id}-confirmation`}
                value={confirmation}
                autoComplete="off"
                onChange={(event) => setConfirmation(event.target.value)}
                disabled={view.busy}
                maxLength={320}
                required
              />
              <p className="text-muted-foreground text-sm">
                {t('confirmation_help', { email })}
              </p>
            </div>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={view.busy}
              onClick={() => changeOpen(false)}
            >
              {t('close')}
            </Button>
            {action ? (
              <Button
                type="submit"
                disabled={view.busy || confirmation !== email}
              >
                {t('restore')}
              </Button>
            ) : null}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
