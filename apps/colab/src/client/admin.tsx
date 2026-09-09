import { useMutation } from '@tanstack/react-query';
import { colabRequest } from '@tuturuuu/internal-api/colab';
import { type RoomView, staff } from '@tuturuuu/multiplayer';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useState } from 'react';
import { ErrorNotice } from './home';
import { useCopy } from './i18n';
import { LimitsPanel } from './limits-panel';
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
    <Card className="studio-panel admin-panel shadow-none">
      <h2 className="font-semibold text-base">{c.facilitator}</h2>
      <p>{c.adminHelp}</p>
      <Accordion
        type="multiple"
        defaultValue={['access', 'limits']}
        className="w-full"
      >
        <AccordionItem value="access">
          <AccordionTrigger className="py-4 text-sm">
            {c.roomMode}
          </AccordionTrigger>
          <AccordionContent forceMount>
            <div className="admin-section">
              <Label>
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
              </Label>
              <Label className="studio-checkbox">
                <Checkbox
                  checked={room.showcase}
                  disabled={busy}
                  onCheckedChange={(checked) =>
                    invoke({ action: 'showcase', enabled: checked === true })
                  }
                />
                {c.showcaseToggle}
              </Label>
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
            </div>
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="invites">
          <AccordionTrigger className="py-4 text-sm">
            {c.invite}
          </AccordionTrigger>
          <AccordionContent forceMount>
            <div className="admin-section">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  invoke({ action: 'invite', email: f.get('email') });
                }}
              >
                <Label>
                  {c.inviteEmail}
                  <Input
                    type="email"
                    name="email"
                    required
                    maxLength={254}
                    placeholder={c.inviteEmailPlaceholder}
                  />
                </Label>
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
            </div>
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="guests">
          <AccordionTrigger className="py-4 text-sm">
            {c.guestAccess}
          </AccordionTrigger>
          <AccordionContent forceMount>
            <div className="admin-section">
              <p>{c.guestHelp}</p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  password.mutate(
                    Number(new FormData(e.currentTarget).get('minutes'))
                  );
                }}
              >
                <Label>
                  {c.minutes}
                  <Input
                    type="number"
                    name="minutes"
                    min={1}
                    max={480}
                    defaultValue={60}
                    placeholder="60"
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
                    {c.until}{' '}
                    {new Date(password.data.expires).toLocaleTimeString()}
                  </p>
                </div>
              )}
              <ErrorNotice error={password.error} />
            </div>
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="limits">
          <AccordionTrigger className="py-4 text-sm">
            {c.usageLimits}
          </AccordionTrigger>
          <AccordionContent forceMount>
            <LimitsPanel room={room} action={action} busy={busy} />
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="scenario">
          <AccordionTrigger className="py-4 text-sm">
            {c.steer}
          </AccordionTrigger>
          <AccordionContent forceMount>
            <div className="admin-section">
              <Label>
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
              </Label>
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
                <Label className="sr-only" htmlFor="steering">
                  {c.steer}
                </Label>
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
            </div>
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="members">
          <AccordionTrigger className="py-4 text-sm">
            {c.members}
          </AccordionTrigger>
          <AccordionContent forceMount>
            <div className="admin-section">
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
                    <Label>
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
                    </Label>
                    {staff(room.self) &&
                      member.email &&
                      member.id !== room.ownerId && (
                        <Label className="studio-checkbox">
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
                        </Label>
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
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </Card>
  );
}
