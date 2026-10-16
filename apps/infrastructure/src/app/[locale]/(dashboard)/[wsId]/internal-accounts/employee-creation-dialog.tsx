'use client';

import { useQuery } from '@tanstack/react-query';
import { UserPlus } from '@tuturuuu/icons';
import { InternalApiError } from '@tuturuuu/internal-api/client';
import {
  createInternalEmployee,
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
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { useTranslations } from 'next-intl';
import { type FormEvent, useId, useRef, useState } from 'react';

type Outcome = 'editing' | 'submitting' | 'created' | 'inspection';
export function EmployeeCreationDialog({
  onDirectoryRefresh,
}: {
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
  const operation = useRef<string | null>(null);
  const inFlight = useRef(false);
  const availability = useQuery({
    queryKey: ['infrastructure', 'employee-creation-availability'],
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
  const editable = outcome === 'editing';
  const available =
    availability.data?.available === true && !availability.isFetching;
  function changeOpen(next: boolean) {
    if (inFlight.current) return;
    if (!next) {
      setTemporaryPassword('');
      if (outcome !== 'inspection') {
        setEmail('');
        setDisplayName('');
        setOutcome('editing');
        setError(false);
        operation.current = null;
      }
    }
    setOpen(next);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current || !editable || !available || !input.success) return;
    inFlight.current = true;
    operation.current ??= crypto.randomUUID();
    setOutcome('submitting');
    setError(false);
    try {
      const result = await createInternalEmployee(input.data, {
        operationId: operation.current,
      });
      setOutcome(result.status === 'created' ? 'created' : 'inspection');
      setTemporaryPassword('');
      // Refresh failure cannot turn a confirmed creation into a second creation attempt.
      try {
        await onDirectoryRefresh();
      } catch {
        /* Created/pending outcome remains settled. */
      }
    } catch (caught) {
      const denied =
        caught instanceof InternalApiError &&
        (caught.status === 400 ||
          caught.status === 401 ||
          caught.status === 403 ||
          (caught.status === 503 &&
            caught.code === 'employee_creation_unavailable'));
      setOutcome(denied ? 'editing' : 'inspection');
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
              <AlertDescription>{t('unavailable')}</AlertDescription>
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
                disabled={!editable}
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
                disabled={!editable}
                required
                maxLength={100}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${id}-password`}>{t('password')}</Label>
              <Input
                id={`${id}-password`}
                type="password"
                autoComplete="new-password"
                value={temporaryPassword}
                onChange={(event) => setTemporaryPassword(event.target.value)}
                disabled={!editable}
                required
                minLength={12}
                maxLength={72}
              />
              <p className="text-muted-foreground text-sm">
                {t('password_help')}
              </p>
            </div>
            {error ? (
              <p role="alert" className="text-destructive text-sm">
                {t('denied')}
              </p>
            ) : null}
            {outcome === 'created' ? <p role="status">{t('created')}</p> : null}
            {outcome === 'inspection' ? (
              <Alert>
                <AlertDescription>{t('inspect')}</AlertDescription>
              </Alert>
            ) : null}
            <DialogFooter className="gap-2 sm:flex-row">
              {outcome === 'inspection' ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    void onDirectoryRefresh().catch(() => undefined);
                  }}
                >
                  {t('refresh')}
                </Button>
              ) : null}
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
