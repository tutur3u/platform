import { useMutation } from '@tanstack/react-query';
import { colabRequest } from '@tuturuuu/internal-api/colab';
import type { Identity, RoomView } from '@tuturuuu/multiplayer';
import { useState } from 'react';
import { appNames, useCopy } from './i18n';
import { LandingPreview, WorkshopDetails } from './landing-preview';

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
}: {
  canHost: boolean;
  identity: Identity | null;
  navigate: (id: string) => void;
}) {
  const c = useCopy();
  const [mode, setMode] = useState<'join' | 'host'>('join');
  const [invalid, setInvalid] = useState(false);
  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      colabRequest<RoomView>('/rooms', body),
    onSuccess: (room) => navigate(room.id),
  });
  const recent = localStorage.getItem('colab-recent-room');
  return (
    <div className="home">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">
            <span className="live-dot" /> {c.eyebrow}
          </p>
          <h1>{c.hero}</h1>
          <p className="intro">{c.intro}</p>
          <div className="hero-actions">
            <a className="button primary" href="#join">
              {c.join} <span aria-hidden="true">↗</span>
            </a>
            <a className="button quiet" href="#explore">
              {c.explore}
            </a>
          </div>
          <div className="hero-pills">
            <span>01 / {c.step1}</span>
            <span>02 / {c.step2}</span>
          </div>
        </div>
        <div className="lab-art" aria-hidden="true">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="art-tag">{c.artFlow}</div>
          <div className="paper paper-back">
            <span>{c.teamNotes}</span>
            <i />
            <i />
            <i />
          </div>
          <div className="paper paper-front">
            <span className="paper-label">SKILL.md</span>
            <strong>{c.step1}</strong>
            <i />
            <i />
            <i />
            <div className="paper-bottom">
              <span className="avatar">A</span>
              <span className="avatar">M</span>
              <span className="avatar">L</span>
              <span>{c.together}</span>
            </div>
          </div>
          <div className="floating-chip chip-one">
            Aa <span>{c.systemPrompt}</span>
          </div>
          <div className="floating-chip chip-two">
            ✓ <span>{c.sandboxReady}</span>
          </div>
          <div className="art-caption">{c.artCaption}</div>
        </div>
      </section>
      <LandingPreview />
      <section className="entry-grid" id="join">
        <div className="entry-copy">
          <span className="section-number">01 / {c.startTogether}</span>
          <h2>{c.inviteOnly}</h2>
          <p>{c.inviteHelp}</p>
          <div className="mini-apps">
            {Object.entries(appNames).map(([id, name]) => (
              <span key={id}>{name}</span>
            ))}
          </div>
          <p className="fine-print">{c.sandboxHelp}</p>
        </div>
        <div className="panel entry-panel">
          <div className="segmented">
            <button
              type="button"
              aria-pressed={mode === 'join'}
              onClick={() => setMode('join')}
            >
              {c.join}
            </button>
            <button
              type="button"
              aria-pressed={mode === 'host'}
              onClick={() => setMode('host')}
            >
              {c.host}
            </button>
          </div>
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
              <a className="button primary" href="/auth/login">
                {c.login} ↗
              </a>
            </div>
          )}
        </div>
      </section>
      <WorkshopDetails />
      <section className="steps">
        {[
          [c.step1, c.step1Text],
          [c.step2, c.step2Text],
          [c.step3, c.step3Text],
        ].map(([title, description], i) => (
          <article key={title}>
            <span className="step-index">0{i + 1}</span>
            <h3>{title}</h3>
            <p>{description}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
