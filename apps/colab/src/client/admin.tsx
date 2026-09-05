import { useMutation } from '@tanstack/react-query';
import { colabRequest } from '@tuturuuu/internal-api/colab';
import { type RoomView, staff } from '@tuturuuu/multiplayer';
import { useState } from 'react';
import { ErrorNotice } from './home';
import { useCopy } from './i18n';

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
    <details className="panel admin-panel">
      <summary>
        <span className="section-number">{c.hostControls}</span>
        <strong>{c.facilitator}</strong>
        <span>+</span>
      </summary>
      <p>{c.adminHelp}</p>
      <div className="admin-grid">
        <section>
          <h3>{c.roomMode}</h3>
          <label>
            {c.roomMode}
            <select
              disabled={busy}
              value={room.mode}
              onChange={(e) => invoke({ action: 'mode', mode: e.target.value })}
            >
              <option value="open">{c.open}</option>
              <option value="readonly">{c.readonly}</option>
              <option value="private">{c.private}</option>
            </select>
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={room.showcase}
              disabled={busy}
              onChange={(e) =>
                invoke({ action: 'showcase', enabled: e.target.checked })
              }
            />
            {c.showcaseToggle}
          </label>
          <button
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
          </button>
          <ErrorNotice error={copyError} />
        </section>
        <section>
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
              <input type="email" name="email" required maxLength={254} />
            </label>
            <button type="submit" disabled={busy}>
              {c.invite}
            </button>
          </form>
          <p className="fine-print">{c.inviteNotice}</p>
          <ul className="invite-list">
            {room.invites?.map((email) => (
              <li key={email}>
                <span>{email}</span>
                <button
                  type="button"
                  className="quiet"
                  disabled={busy}
                  onClick={() => invoke({ action: 'revoke', email })}
                >
                  {c.revoke}
                </button>
              </li>
            ))}
          </ul>
        </section>
        <section>
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
              <input
                type="number"
                name="minutes"
                min={1}
                max={480}
                defaultValue={60}
              />
            </label>
            <button type="submit" disabled={password.isPending}>
              {c.generatePassword}
            </button>
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
        <section>
          <h3>{c.steer}</h3>
          <label>
            {c.scenarioLibrary}
            <select
              value={room.scenarios.findIndex(
                (s) => s.title === room.scenario.title
              )}
              disabled={busy}
              onChange={(e) =>
                invoke({
                  action: 'selectScenario',
                  index: Number(e.target.value),
                })
              }
            >
              {room.scenarios.map((scenario, index) => (
                <option key={scenario.title} value={index}>
                  {scenario.title}
                </option>
              ))}
            </select>
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
            <textarea
              id="steering"
              name="steering"
              maxLength={2000}
              placeholder={c.steerPlaceholder}
            />
            <button type="submit" disabled={busy}>
              {busy ? c.working : c.newScenario}
            </button>
          </form>
        </section>
      </div>
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
              <select
                value={member.teamId}
                disabled={busy}
                onChange={(e) =>
                  invoke({
                    action: 'assign',
                    memberId: member.id,
                    teamId: e.target.value,
                  })
                }
              >
                {room.teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </label>
            {staff(room.self) && member.email && member.id !== room.ownerId && (
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={member.admin}
                  disabled={busy}
                  onChange={(e) =>
                    invoke({
                      action: 'admin',
                      memberId: member.id,
                      enabled: e.target.checked,
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
          <button
            type="button"
            key={team.id}
            disabled={busy}
            onClick={() => invoke({ action: 'reset', teamId: team.id })}
          >
            {c.reset} · {team.name}
          </button>
        ))}
      </div>
    </details>
  );
}
