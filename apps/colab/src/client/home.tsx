import { useMutation } from '@tanstack/react-query';
import { colabRequest } from '@tuturuuu/internal-api/colab';
import type { Identity, RoomView } from '@tuturuuu/multiplayer';
import { useState } from 'react';
import { useCopy } from './i18n';

function dateValue(time: number) {
  const d = new Date(time);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}
export function ErrorNotice({ error }: { error: unknown }) {
  const c = useCopy();
  return error ? (
    <p className="error" role="alert">
      {c.error} <code>{error instanceof Error ? error.message : ''}</code>{' '}
      {c.authHelp}
    </p>
  ) : null;
}
export function Home({
  canHost,
  navigate,
  mode = 'join',
}: {
  mode?: 'join' | 'host';
  canHost: boolean;
  identity: Identity | null;
  navigate: (id: string) => void;
}) {
  const c = useCopy();
  const [invalid, setInvalid] = useState(false);
  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      colabRequest<RoomView>('/rooms', body),
    onSuccess: (room) => navigate(room.id),
  });
  const recent = localStorage.getItem('colab-recent-room');
  return (
    <div className="home">
      <section className="lobby-heading">
        <div>
          <h1>{mode === 'host' ? c.host : c.join}</h1>
          <p>{mode === 'host' ? c.scheduleHelp : c.inviteHelp}</p>
        </div>
      </section>
      <section className="entry-grid entry-focused" id="join">
        <div className="panel entry-panel">
          {mode === 'join' ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const value = String(
                  new FormData(e.currentTarget).get('room')
                ).trim();
                let id = value;
                try {
                  id = new URL(value).searchParams.get('room') ?? value;
                } catch {}
                if (/^[a-f0-9-]{36}$/.test(id)) navigate(id);
                else setInvalid(true);
              }}
            >
              <label>
                {c.roomId}
                <input
                  name="room"
                  required
                  placeholder="https://colab.tuturuuu.com/?room=…"
                />
              </label>
              <button type="submit" className="primary wide">
                {c.join} <span aria-hidden="true">↗</span>
              </button>
              {invalid && (
                <p role="alert" className="error">
                  {c.error}
                </p>
              )}
              {recent && (
                <button
                  type="button"
                  className="quiet wide"
                  onClick={() => navigate(recent)}
                >
                  {c.recent}
                </button>
              )}
            </form>
          ) : canHost ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                create.mutate({
                  title: f.get('title'),
                  startsAt: new Date(String(f.get('starts'))).getTime(),
                  endsAt: new Date(String(f.get('ends'))).getTime(),
                  maxUsers: Number(f.get('capacity')),
                  teamCount: Number(f.get('teams')),
                });
              }}
            >
              <label>
                {c.title}
                <input
                  name="title"
                  required
                  maxLength={100}
                  defaultValue={c.defaultTitle}
                />
              </label>
              <div className="field-pair">
                <label>
                  {c.starts}
                  <input
                    name="starts"
                    type="datetime-local"
                    defaultValue={dateValue(Date.now() + 60_000)}
                    required
                  />
                </label>
                <label>
                  {c.ends}
                  <input
                    name="ends"
                    type="datetime-local"
                    defaultValue={dateValue(Date.now() + 3660_000)}
                    required
                  />
                </label>
              </div>
              <div className="field-pair">
                <label>
                  {c.capacity}
                  <input
                    name="capacity"
                    type="number"
                    min={2}
                    max={100}
                    defaultValue={24}
                  />
                </label>
                <label>
                  {c.teamCount}
                  <input
                    name="teams"
                    type="number"
                    min={1}
                    max={12}
                    defaultValue={4}
                  />
                </label>
              </div>
              <p className="fine-print">{c.scheduleHelp}</p>
              <button
                type="submit"
                className="primary wide"
                disabled={create.isPending}
              >
                {create.isPending ? c.working : c.create}
              </button>
              <ErrorNotice error={create.error} />
            </form>
          ) : (
            <div className="host-gate">
              <h3>{c.hostOnly}</h3>
              <p>{c.scheduleHelp}</p>
              <a className="button primary" href="/join">
                {c.join}
              </a>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
