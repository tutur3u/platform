'use client';

import { useQuery } from '@tanstack/react-query';
import { InternalApiError } from '@tuturuuu/internal-api/client';
import {
  getWorkspaceUser,
  updateWorkspaceUser,
  type WorkspaceBasicUserRecord,
} from '@tuturuuu/internal-api/users';
import { Button } from '@tuturuuu/ui/button';
import { Checkbox } from '@tuturuuu/ui/checkbox';
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
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState } from 'react';

export type PeriodicRecipientIntent = {
  actor: NonNullable<ReturnType<typeof useWorkspaceActor>>;
  wsId: string;
  userId: string;
  epoch: number;
};

type Props = {
  intent: PeriodicRecipientIntent | null;
  wsId: string;
  epoch: number;
  canUpdateUsers: boolean;
  onClose: () => void;
  onSaved: () => void;
};

function accessDenied(error: unknown) {
  return error instanceof InternalApiError && [401, 403].includes(error.status);
}

export function PeriodicRecipientRemediation(props: Props) {
  const actor = useWorkspaceActor();
  const { intent, wsId, epoch, canUpdateUsers, onClose } = props;
  const valid = Boolean(
    intent &&
      actor === intent.actor &&
      actor.lifetime.active &&
      wsId === intent.wsId &&
      epoch === intent.epoch &&
      canUpdateUsers
  );
  // Unmounting removes editable state when an account, workspace or filter changes.
  useEffect(() => {
    if (intent && !valid) onClose();
  }, [intent, valid, onClose]);
  return valid && intent ? (
    <RecipientDialog
      key={`${wsId}:${intent.userId}:${epoch}`}
      {...props}
      intent={intent}
    />
  ) : null;
}

function RecipientDialog({
  intent,
  onClose,
  onSaved,
  ...scope
}: Omit<Props, 'intent'> & {
  intent: PeriodicRecipientIntent;
}) {
  const t = useTranslations('reports-hub');
  const actor = useWorkspaceActor();
  const current = useRef({ intent, actor, ...scope });
  current.current = { intent, actor, ...scope };
  const [denied, setDenied] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const assertActive = () => {
    const now = current.current;
    intent.actor.assertActive();
    if (
      !mounted.current ||
      now.intent !== intent ||
      now.actor !== intent.actor ||
      now.wsId !== intent.wsId ||
      now.epoch !== intent.epoch ||
      !now.canUpdateUsers
    )
      throw new Error('Recipient edit expired');
  };
  const userQuery = useQuery({
    queryKey: [
      'periodic-recipient-edit',
      intent.actor.actorId,
      intent.wsId,
      intent.userId,
      intent.epoch,
    ],
    queryFn: async () => {
      assertActive();
      const user = await getWorkspaceUser(intent.wsId, intent.userId);
      assertActive();
      if (user.id !== intent.userId)
        throw new Error('Recipient identity mismatch');
      return user;
    },
    retry: false,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
  const forbidden = denied || accessDenied(userQuery.error);
  useEffect(() => {
    if (forbidden) onClose();
  }, [forbidden, onClose]);
  return (
    <Dialog
      open={!forbidden}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('recipient_edit_title')}</DialogTitle>
          <DialogDescription>
            {t('recipient_edit_description')}
          </DialogDescription>
        </DialogHeader>
        {userQuery.isPending && (
          <div
            role="status"
            aria-busy="true"
            aria-label={t('recipient_loading')}
            className="space-y-4"
          >
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        )}
        {userQuery.isError && !forbidden && (
          <p role="alert">{t('recipient_load_failed')}</p>
        )}
        {!forbidden && userQuery.data && !userQuery.isError && (
          <RecipientForm
            user={userQuery.data}
            intent={intent}
            assertActive={assertActive}
            onClose={onClose}
            onSaved={onSaved}
            onDenied={() => setDenied(true)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function RecipientForm({
  user,
  intent,
  assertActive,
  onClose,
  onSaved,
  onDenied,
}: {
  user: WorkspaceBasicUserRecord;
  intent: PeriodicRecipientIntent;
  assertActive: () => void;
  onClose: () => void;
  onSaved: () => void;
  onDenied: () => void;
}) {
  const t = useTranslations('reports-hub');
  const id = useId();
  const [displayName, setDisplayName] = useState(user.display_name ?? '');
  const [email, setEmail] = useState(user.email ?? '');
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const baseline = useRef(user).current;
  const emailChanged = email.trim() !== (baseline.email ?? '');
  const changed =
    emailChanged || displayName.trim() !== (baseline.display_name ?? '');
  const save = async () => {
    if (inFlight.current || !changed || (emailChanged && !confirmed)) return;
    if (
      (emailChanged || email.trim()) &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    ) {
      setError('recipient_email_invalid');
      return;
    }
    try {
      assertActive();
    } catch {
      onClose();
      return;
    }
    inFlight.current = true;
    setPending(true);
    setError(null);
    try {
      // Check the server record again; never overwrite a changed recipient from a stale dialog.
      const latest = await getWorkspaceUser(intent.wsId, intent.userId);
      assertActive();
      if (
        latest.id !== intent.userId ||
        latest.email !== baseline.email ||
        latest.display_name !== baseline.display_name
      ) {
        setError('recipient_changed');
        return;
      }
      await updateWorkspaceUser(intent.wsId, intent.userId, {
        display_name: displayName.trim() || null,
        email: email.trim() || null,
      });
      assertActive();
      onSaved();
      onClose();
    } catch (caught) {
      try {
        assertActive();
      } catch {
        return;
      }
      if (accessDenied(caught)) onDenied();
      else setError('recipient_save_failed');
    } finally {
      inFlight.current = false;
      try {
        assertActive();
        setPending(false);
      } catch {
        /* Discard old-account state. */
      }
    }
  };
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
      className="space-y-4"
    >
      <div className="space-y-2">
        <Label htmlFor={`${id}-name`}>{t('recipient_display_name')}</Label>
        <Input
          id={`${id}-name`}
          value={displayName}
          disabled={pending}
          maxLength={255}
          onChange={(event) => setDisplayName(event.target.value)}
          autoComplete="off"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${id}-email`}>{t('recipient_email')}</Label>
        <Input
          id={`${id}-email`}
          type="email"
          required={emailChanged}
          value={email}
          disabled={pending}
          maxLength={320}
          onChange={(event) => {
            setEmail(event.target.value);
            setConfirmed(false);
          }}
          autoComplete="off"
          aria-describedby={`${id}-notice`}
        />
      </div>
      <p id={`${id}-notice`} className="text-muted-foreground text-sm">
        {t('recipient_save_notice')}
      </p>
      {emailChanged && (
        <div className="flex items-start gap-2">
          <Checkbox
            id={`${id}-confirm`}
            checked={confirmed}
            disabled={pending}
            onCheckedChange={(checked) => setConfirmed(checked === true)}
          />
          <Label htmlFor={`${id}-confirm`} className="text-sm">
            {t('recipient_confirm_email')}
          </Label>
        </div>
      )}
      <div role="status" aria-live="polite" className="min-h-5 text-sm">
        {pending
          ? t('recipient_saving')
          : error && <span role="alert">{t(error)}</span>}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          {t('cancel')}
        </Button>
        <Button
          type="submit"
          disabled={pending || !changed || (emailChanged && !confirmed)}
        >
          {t('recipient_save')}
        </Button>
      </DialogFooter>
    </form>
  );
}
