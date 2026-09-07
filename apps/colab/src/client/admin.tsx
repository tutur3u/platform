import { useMutation } from '@tanstack/react-query';
import { colabRequest } from '@tuturuuu/internal-api/colab';
import { type RoomView, staff } from '@tuturuuu/multiplayer';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import { Input } from '@tuturuuu/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useState } from 'react';
import { ErrorNotice } from './home';
import { useCopy } from './i18n';
import { SelectField } from './select-field';

export function Admin({
  room,
  action,
  busy,
}: {
  room: RoomView;
  action: (body: Record<string, unknown>, route?: string) => Promise<void>;
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
  const invoke = (body: Record<string, unknown>, route?: string) => {
    void action(body, route).catch(() => {});
  };
  return (
    <Card className="panel admin-panel">
      <h2 className="font-semibold text-base">{c.facilitator}</h2>
      <p>{c.adminHelp}</p>
      <Tabs defaultValue="access">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="access">{c.roomMode}</TabsTrigger>
          <TabsTrigger value="invites">{c.invite}</TabsTrigger>
          <TabsTrigger value="guests">{c.guestAccess}</TabsTrigger>
          <TabsTrigger value="scenario">{c.steer}</TabsTrigger>
          <TabsTrigger value="members">{c.members}</TabsTrigger>
        </TabsList>
        <div className="max-w-3xl pt-4">
          <TabsContent
            value="access"
            forceMount
            className="data-[state=inactive]:hidden"
          >
            <h3>{c.roomMode}</h3>
            <label>
              {c.roomMode}
              <SelectField
                label={c.roomMode}
                disabled={busy}
                value={room.mode}
                onValueChange={(value) =>
                  invoke({ action: 'mode', mode: value })
                }
              >
                <option value="open">{c.open}</option>
                <option value="readonly">{c.readonly}</option>
                <option value="private">{c.private}</option>
              </SelectField>
            </label>
            <label className="checkbox">
              <Checkbox
                checked={room.showcase}
                disabled={busy}
                onCheckedChange={(checked) =>
                  invoke({ action: 'showcase', enabled: checked === true })
                }
              />
              {c.showcaseToggle}
            </label>
            <Button
              type="button"
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
              {copied ? c.copied : c.copyLink}
            </Button>
            <ErrorNotice error={copyError} />
          </TabsContent>
          <TabsContent
            value="invites"
            forceMount
            className="data-[state=inactive]:hidden"
          >
            <h3>{c.invite}</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                invoke({ action: 'invite', email: f.get('email') });
              }}
            >
              <label>
                {c.inviteEmail}
                <Input type="email" name="email" required maxLength={254} />
              </label>
              <Button type="submit" disabled={busy}>
                {c.invite}
              </Button>
            </form>
            <p className="fine-print">{c.inviteNotice}</p>
            <ul className="invite-list">
              {room.invites?.map((email) => (
                <li key={email}>
                  <span>{email}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => invoke({ action: 'revoke', email })}
                  >
                    {c.revoke}
                  </Button>
                </li>
              ))}
            </ul>
          </TabsContent>
          <TabsContent
            value="guests"
            forceMount
            className="data-[state=inactive]:hidden"
          >
            <h3>{c.guestAccess}</h3>
            <p>{c.guestHelp}</p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                password.mutate(
                  Number(new FormData(e.currentTarget).get('minutes'))
                );
              }}
            >
              <label>
                {c.minutes}
                <Input
                  type="number"
                  name="minutes"
                  min={1}
                  max={480}
                  defaultValue={60}
                />
              </label>
              <Button type="submit" disabled={password.isPending}>
                {c.generatePassword}
              </Button>
            </form>
            {password.data && (
              <div className="password-reveal">
                <code>{password.data.password}</code>
                <p>
                  {c.until}{' '}
                  {new Date(password.data.expires).toLocaleTimeString()}
                </p>
              </div>
            )}
            <ErrorNotice error={password.error} />
          </TabsContent>
          <TabsContent
            value="scenario"
            forceMount
            className="data-[state=inactive]:hidden"
          >
            <h3>{c.steer}</h3>
            <label>
              {c.scenarioLibrary}
              <SelectField
                label={c.scenarioLibrary}
                value={room.scenarios.findIndex(
                  (s) => s.title === room.scenario.title
                )}
                disabled={busy}
                onValueChange={(value) =>
                  invoke({
                    action: 'selectScenario',
                    index: Number(value),
                  })
                }
              >
                {room.scenarios.map((scenario, index) => (
                  <option key={scenario.title} value={index}>
                    {scenario.title}
                  </option>
                ))}
              </SelectField>
            </label>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                invoke(
                  {
                    action: 'scenario',
                    steering: new FormData(e.currentTarget).get('steering'),
                  },
                  'ai'
                );
              }}
            >
              <label className="sr-only" htmlFor="steering">
                {c.steer}
              </label>
              <Textarea
                id="steering"
                name="steering"
                maxLength={2000}
                placeholder={c.steerPlaceholder}
              />
              <Button type="submit" disabled={busy}>
                {busy ? c.working : c.newScenario}
              </Button>
            </form>
          </TabsContent>
        </div>
        <TabsContent
          value="members"
          forceMount
          className="data-[state=inactive]:hidden"
        >
          <h3>
            {c.members} ({room.members.length}/{room.maxUsers})
          </h3>
          <div className="member-list">
            {room.members.map((member) => (
              <div className="member-row" key={member.id}>
                <div>
                  <strong>{member.name}</strong>
                  <small>{member.email ?? c.guestAccess}</small>
                </div>
                <label>
                  {c.assign}
                  <SelectField
                    label={c.assign}
                    value={member.teamId}
                    disabled={busy}
                    onValueChange={(value) =>
                      invoke({
                        action: 'assign',
                        memberId: member.id,
                        teamId: value,
                      })
                    }
                  >
                    {room.teams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                  </SelectField>
                </label>
                {staff(room.self) &&
                  member.email &&
                  member.id !== room.ownerId && (
                    <label className="checkbox">
                      <Checkbox
                        checked={member.admin}
                        disabled={busy}
                        onCheckedChange={(checked) =>
                          invoke({
                            action: 'admin',
                            memberId: member.id,
                            enabled: checked === true,
                          })
                        }
                      />
                      {c.role}
                    </label>
                  )}
              </div>
            ))}
          </div>
          <div className="action-row">
            {room.teams.map((team) => (
              <Button
                type="button"
                key={team.id}
                disabled={busy}
                onClick={() => invoke({ action: 'reset', teamId: team.id })}
              >
                {c.reset} · {team.name}
              </Button>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </Card>
  );
}
