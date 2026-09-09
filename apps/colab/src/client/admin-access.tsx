import { useMutation } from '@tanstack/react-query';
import { Copy, KeyRound, Lock, UserPlus } from '@tuturuuu/icons';
import { colabRequest } from '@tuturuuu/internal-api/colab';
import type { RoomView } from '@tuturuuu/multiplayer';
import { Button } from '@tuturuuu/ui/button';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { useState } from 'react';
import { ErrorNotice } from './home';
import { useCopy } from './i18n';
import { SelectField } from './select-field';

type Action = (body: Record<string, unknown>, route?: string) => Promise<void>;

export function AdminAccess({
  room,
  action,
  busy,
}: {
  room: RoomView;
  action: Action;
  busy: boolean;
}) {
  const c = useCopy();
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<unknown>();
  const password = useMutation({
    mutationFn: (minutes: number) =>
      colabRequest<{ password: string; expires: number }>(
        `/rooms/${room.id}/password`,
        { minutes }
      ),
  });
  const invoke = (body: Record<string, unknown>) =>
    void action(body).catch(() => {});
  return (
    <div className="admin-tab-content">
      <div className="admin-tab-heading">
        <div>
          <h3>{c.accessAndInvites}</h3>
          <p>{c.accessAndInvitesHelp}</p>
        </div>
        <Lock className="size-5 text-muted-foreground" aria-hidden="true" />
      </div>
      <section className="admin-subsection">
        <div className="grid gap-4 sm:grid-cols-2">
          <Label>
            {c.roomMode}
            <SelectField
              label={c.roomMode}
              disabled={busy}
              value={room.mode}
              onValueChange={(mode) => invoke({ action: 'mode', mode })}
            >
              <option value="open">{c.open}</option>
              <option value="readonly">{c.readonly}</option>
              <option value="private">{c.private}</option>
            </SelectField>
          </Label>
          <div className="grid content-end gap-2">
            <Label className="studio-checkbox rounded-lg border px-3 py-2.5">
              <Checkbox
                checked={room.showcase}
                disabled={busy}
                onCheckedChange={(checked) =>
                  invoke({ action: 'showcase', enabled: checked === true })
                }
              />
              {c.showcaseToggle}
            </Label>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(
                `${location.origin}/?room=${room.id}`
              );
              setCopied(true);
              setTimeout(() => setCopied(false), 2500);
            } catch (error) {
              setCopyError(error);
            }
          }}
        >
          <Copy className="size-4" aria-hidden="true" />
          {copied ? c.copied : c.copyLink}
        </Button>
        <ErrorNotice error={copyError} />
      </section>
      <section className="admin-subsection">
        <div className="subsection-heading">
          <UserPlus className="size-4" aria-hidden="true" />
          <h4>{c.accountInvites}</h4>
        </div>
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const email = new FormData(form).get('email');
            void action({ action: 'invite', email })
              .then(() => form.reset())
              .catch(() => {});
          }}
        >
          <Label className="min-w-0 flex-1">
            {c.inviteEmail}
            <Input
              type="email"
              name="email"
              spellCheck={false}
              required
              maxLength={254}
              autoComplete="email"
              placeholder={c.inviteEmailPlaceholder}
            />
          </Label>
          <Button type="submit" disabled={busy}>
            {c.invite}
          </Button>
        </form>
        <p className="fine-print">{c.inviteNotice}</p>
        <div className="invite-chips">
          {room.invites?.map((email) => (
            <span key={email}>
              {email}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => invoke({ action: 'revoke', email })}
              >
                {c.revoke}
              </Button>
            </span>
          ))}
          {!room.invites?.length && (
            <p className="empty compact-empty">{c.noInvites}</p>
          )}
        </div>
      </section>
      <section className="admin-subsection">
        <div className="subsection-heading">
          <KeyRound className="size-4" aria-hidden="true" />
          <h4>{c.guestAccess}</h4>
        </div>
        <p className="fine-print">{c.guestHelp}</p>
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            password.mutate(
              Number(new FormData(event.currentTarget).get('minutes'))
            );
          }}
        >
          <Label className="min-w-0 flex-1">
            {c.minutes}
            <Input
              type="number"
              name="minutes"
              autoComplete="off"
              min={1}
              max={480}
              defaultValue={60}
            />
          </Label>
          <Button type="submit" disabled={password.isPending}>
            {c.generatePassword}
          </Button>
        </form>
        {password.data && (
          <div className="password-reveal">
            <code>{password.data.password}</code>
            <p>
              {c.until} {new Date(password.data.expires).toLocaleTimeString()}
            </p>
          </div>
        )}
        <ErrorNotice error={password.error} />
      </section>
    </div>
  );
}
