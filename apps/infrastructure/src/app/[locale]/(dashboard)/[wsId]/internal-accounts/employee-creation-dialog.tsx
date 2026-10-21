'use client';

import { useQuery } from '@tanstack/react-query';
import { UserPlus } from '@tuturuuu/icons';
import { InternalApiError } from '@tuturuuu/internal-api/client';
import {
  createInternalEmployee,
  EmployeeCreationPasswordSchema,
  EmployeeCreationPayloadSchema,
  getEmployeeCreationAvailability,
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
import {
  ROOT_WORKSPACE_ID,
  resolveWorkspaceId,
} from '@tuturuuu/utils/constants';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  type FormEvent,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { EmployeeCreationRecovery } from './employee-creation-recovery';
import { EmployeeOriginalOperationResume } from './employee-original-operation-resume';
import { EmployeeRejectionRecoveryPanel } from './employee-rejection-recovery-panel';
import { TemporaryPasswordField } from './temporary-password-field';

type Outcome =
  | 'editing'
  | 'submitting'
  | 'created'
  | 'inspection'
  | 'recovering'
  | 'conflict'
  | 'stopped';
const lifetimes = new WeakMap<object, number>();
let lifetimeSequence = 0;
export function EmployeeCreationDialog(props: {
  onDirectoryRefresh: () => Promise<unknown>;
}) {
  const actor = useWorkspaceActor();
  const { wsId } = useParams<{ wsId: string }>();
  const workspaceId = resolveWorkspaceId(wsId);
  if (!actor || workspaceId !== ROOT_WORKSPACE_ID) return null;
  let lifetime = lifetimes.get(actor.lifetime);
  if (lifetime === undefined) {
    lifetime = ++lifetimeSequence;
    lifetimes.set(actor.lifetime, lifetime);
  }
  return (
    <ScopedEmployeeCreationDialog
      key={`${actor.actorId}:${workspaceId}:${lifetime}`}
      {...props}
      actorId={actor.actorId}
      workspaceId={workspaceId}
      assertActorActive={actor.assertActive}
    />
  );
}
function ScopedEmployeeCreationDialog({
  onDirectoryRefresh,
  actorId,
  workspaceId,
  assertActorActive,
}: {
  actorId: string;
  workspaceId: string;
  assertActorActive(): void;
  onDirectoryRefresh: () => Promise<unknown>;
}) {
  const t = useTranslations('internal-accounts.creation');
  const id = useId();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [outcome, setOutcome] = useState<Outcome>('editing');
  const [error, setError] = useState(false);
  const [recovery] = useState(
    () =>
      new EmployeeCreationRecovery({
        actorId,
        workspaceId,
        assertActive: assertActorActive,
        storage: {
          getItem: (key) => sessionStorage.getItem(key),
          setItem: (key, value) => sessionStorage.setItem(key, value),
          removeItem: (key) => sessionStorage.removeItem(key),
        },
      })
  );
  useLayoutEffect(() => {
    recovery.activate();
    return () => recovery.retire();
  }, [recovery]);
  useQuery({
    queryKey: [
      'employee-create-observation',
      actorId,
      workspaceId,
      recovery.reference?.operationId,
    ],
    enabled: open && outcome === 'recovering',
    queryFn: async () => {
      const result = await recovery.read();
      recovery.assertActive();
      if (result?.status === 'created') {
        setOutcome('created');
        void onDirectoryRefresh().catch(() => undefined);
      } else if (result?.status === 'conflict' || result?.status === 'stopped')
        setOutcome(result.status);
      else if (!recovery.canRead())
        setOutcome(
          recovery.reference?.state === 'stopped' ? 'stopped' : 'inspection'
        );
      return result;
    },
    retry: false,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchInterval: outcome === 'recovering' ? 500 : false,
  });
  const inFlight = useRef(false);
  const availability = useQuery({
    queryKey: [
      'infrastructure',
      'employee-creation-availability',
      actorId,
      workspaceId,
    ],
    queryFn: () => getEmployeeCreationAvailability(),
    enabled: open,
    retry: false,
    staleTime: 0,
  });
  const input = EmployeeCreationPayloadSchema.safeParse({
    email,
    displayName,
    temporaryPassword,
  });
  const passwordInvalid =
    temporaryPassword.length > 0 &&
    !EmployeeCreationPasswordSchema.safeParse(temporaryPassword).success;
  const [resumingOriginal, setResumingOriginal] = useState(false);
  const editable = outcome === 'editing' && !resumingOriginal;
  const available =
    availability.data?.available === true && !availability.isFetching;
  function changeOpen(next: boolean) {
    if (inFlight.current || resumingOriginal) return;
    if (next) {
      try {
        const saved = recovery.load();
        if (saved) {
          setEmail(saved.email);
          setDisplayName(saved.displayName);
          setOutcome(
            saved.state === 'pending'
              ? recovery.canRead()
                ? 'recovering'
                : 'inspection'
              : saved.state === 'retry_ready'
                ? 'editing'
                : saved.state === 'adjudicating'
                  ? 'stopped'
                  : saved.state
          );
        }
      } catch {
        setError(true);
        setOutcome('stopped');
      }
    }
    if (!next) {
      setTemporaryPassword('');
      if (outcome === 'created' || outcome === 'editing') {
        setEmail('');
        setDisplayName('');
        setOutcome('editing');
        setError(false);
      }
    }
    setOpen(next);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current || !editable || !available || !input.success) return;
    inFlight.current = true;
    let original: ReturnType<EmployeeCreationRecovery['prepare']>;
    try {
      original = recovery.prepare(input.data);
    } catch {
      inFlight.current = false;
      setError(true);
      setOutcome('stopped');
      return;
    }
    setOutcome('submitting');
    setError(false);
    try {
      const result = await createInternalEmployee(input.data, {
        operationId: original.operationId,
      });
      recovery.assertActive();
      if (result.status === 'created') {
        // Completion stays successful even if local reference cleanup fails.
        try {
          recovery.complete();
        } catch {
          /* Preserved reference remains safe to observe. */
        }
        setOutcome('created');
      } else if (result.status === 'conflict') {
        recovery.stop('conflict');
        setOutcome('conflict');
      } else setOutcome('recovering');
      setTemporaryPassword('');
      // Refresh failure cannot turn a confirmed creation into a second creation attempt.
      try {
        await onDirectoryRefresh();
      } catch {
        /* Created/pending outcome remains settled. */
      }
    } catch (caught) {
      try {
        recovery.assertActive();
      } catch {
        return;
      }
      const denied =
        caught instanceof InternalApiError &&
        (caught.status === 400 ||
          caught.status === 401 ||
          caught.status === 403 ||
          (caught.status === 503 &&
            caught.code === 'employee_creation_unavailable'));
      if (denied && !recovery.reference?.rejection) {
        try {
          recovery.complete();
        } catch {
          setOutcome('stopped');
          setError(true);
          return;
        }
      }
      setOutcome(
        denied && !recovery.reference?.rejection ? 'editing' : 'recovering'
      );
      setError(denied);
      setTemporaryPassword('');
    } finally {
      inFlight.current = false;
    }
  }
  return (
    <>
      <Button variant="outline" onClick={() => changeOpen(true)}>
        <UserPlus className="h-4 w-4" />
        {t('open')}
      </Button>
      <Dialog open={open} onOpenChange={changeOpen}>
        <DialogContent
          className="max-h-[90dvh] overflow-y-auto sm:max-w-lg"
          onEscapeKeyDown={(event) => {
            if (inFlight.current) event.preventDefault();
          }}
          onInteractOutside={(event) => {
            if (inFlight.current) event.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>{t('title')}</DialogTitle>
            <DialogDescription>{t('description')}</DialogDescription>
          </DialogHeader>
          {!available && editable ? (
            <Alert>
              <AlertDescription>
                {t(availability.isFetching ? 'checking' : 'unavailable')}
              </AlertDescription>
            </Alert>
          ) : null}
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor={`${id}-email`}>{t('email')}</Label>
              <Input
                id={`${id}-email`}
                type="email"
                autoComplete="off"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={!editable || Boolean(recovery.reference)}
                required
                maxLength={320}
              />
              <p className="text-muted-foreground text-sm">{t('email_help')}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${id}-name`}>{t('name')}</Label>
              <Input
                id={`${id}-name`}
                autoComplete="off"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                disabled={!editable || Boolean(recovery.reference)}
                required
                maxLength={100}
              />
            </div>
            <div className="space-y-2">
              <TemporaryPasswordField
                id={`${id}-password`}
                label={t('password')}
                help={t('password_help')}
                minLength={12}
                value={temporaryPassword}
                onChange={setTemporaryPassword}
                disabled={!editable}
                invalid={passwordInvalid}
              />
              {passwordInvalid && editable ? (
                <p role="alert" className="text-destructive text-sm">
                  {t('password_strength')}
                </p>
              ) : null}
            </div>
            {error ? (
              <p role="alert" className="text-destructive text-sm">
                {t('denied')}
              </p>
            ) : null}
            {outcome === 'created' ? <output>{t('created')}</output> : null}
            {['inspection', 'recovering', 'conflict', 'stopped'].includes(
              outcome
            ) ? (
              <Alert>
                <AlertDescription>
                  {t(
                    outcome === 'recovering'
                      ? 'confirming'
                      : outcome === 'conflict'
                        ? 'conflict'
                        : outcome === 'stopped'
                          ? 'stopped'
                          : 'inspect'
                  )}
                </AlertDescription>
              </Alert>
            ) : null}
            {outcome === 'editing' && !recovery.reference ? (
              <details>
                <summary className="cursor-pointer text-sm">
                  {t('advanced')}
                </summary>
                <EmployeeOriginalOperationResume
                  recovery={recovery}
                  onBusyChange={(busy) => {
                    inFlight.current = busy;
                    setResumingOriginal(busy);
                  }}
                  onResume={(reference) => {
                    recovery.assertActive();
                    setEmail(reference.email);
                    setDisplayName(reference.displayName);
                    setTemporaryPassword('');
                    setError(false);
                    setOutcome(
                      reference.state === 'retry_ready' ? 'editing' : 'stopped'
                    );
                  }}
                />
              </details>
            ) : null}
            {['inspection', 'conflict', 'stopped'].includes(outcome) &&
            recovery.reference ? (
              <details>
                <summary className="cursor-pointer text-sm">
                  {t('advanced')}
                </summary>
                <EmployeeRejectionRecoveryPanel
                  recovery={recovery}
                  onReady={() => {
                    recovery.assertActive();
                    setTemporaryPassword('');
                    setError(false);
                    setOutcome('editing');
                  }}
                />
              </details>
            ) : null}
            <DialogFooter className="gap-2 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                disabled={outcome === 'submitting'}
                onClick={() => changeOpen(false)}
              >
                {t('close')}
              </Button>
              <Button
                type="submit"
                disabled={!editable || !available || !input.success}
              >
                {outcome === 'submitting' ? t('submitting') : t('submit')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
