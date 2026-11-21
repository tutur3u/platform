/**
 * EduFest workshop page: a preview of the booth-voting game. Visitors pick a
 * booth and cast one vote; a cast vote is final. The game is not public, so
 * the section is marked Coming and its booths are placeholders.
 */
import { Check, DoorOpen, Vote } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useReducer, useRef } from 'react';
import {
  BOOTHS,
  VOTE_START,
  voteReducer,
} from '../../content/workshops/edufest-2026-demos';
import { type EduMessages, WsBadge } from './shared';

export function WsBoothHall({ t }: { t: EduMessages }) {
  const copy = t.booth;
  const [state, dispatch] = useReducer(voteReducer, VOTE_START);
  const firstBooth = useRef<HTMLButtonElement>(null);
  const label = (id: string) => `${copy.boothLabel} ${id.toUpperCase()}`;
  return (
    <section className="section" aria-labelledby="ws-booth">
      <header className="section-head ws-head-row">
        <div>
          <h2 id="ws-booth">{copy.title}</h2>
          <p>{copy.subtitle}</p>
        </div>
        <WsBadge status="planned" label={t.demos.coming} t={t} />
      </header>
      <div className="ws-hall-wrap">
        <div className="ws-hall-stage">
          <ul className="ws-hall" aria-label={copy.hallLabel}>
            {BOOTHS.map((id) => {
              const chosen = state.choice === id;
              return (
                <li key={id}>
                  <button
                    ref={id === BOOTHS[0] ? firstBooth : undefined}
                    type="button"
                    className="ws-booth"
                    data-chosen={chosen || undefined}
                    data-cast={(chosen && state.phase === 'cast') || undefined}
                    aria-pressed={chosen}
                    disabled={state.phase === 'cast'}
                    onClick={() => dispatch({ type: 'choose', booth: id })}
                  >
                    <span className="ws-booth-roof" aria-hidden />
                    {label(id)}
                    {chosen && state.phase === 'cast' ? (
                      <Check size={14} aria-hidden />
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="ws-hall-door">
            <DoorOpen size={14} aria-hidden />
            {copy.entrance}
          </p>
        </div>
        <div className="ws-hall-panel" aria-live="polite">
          <p className="ws-seat-kicker">
            <Vote size={14} aria-hidden />
            {copy.panelTitle}
          </p>
          {state.phase === 'cast' ? (
            <>
              <p>{copy.cast.replace('{booth}', label(state.choice))}</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  dispatch({ type: 'reset' });
                  // The reset button disappears; keep focus in the hall.
                  requestAnimationFrame(() => firstBooth.current?.focus());
                }}
              >
                {copy.reset}
              </Button>
            </>
          ) : (
            <>
              <p>
                {state.choice
                  ? copy.chosen.replace('{booth}', label(state.choice))
                  : copy.choose}
              </p>
              <Button
                type="button"
                size="sm"
                disabled={!state.choice}
                onClick={() => dispatch({ type: 'cast' })}
              >
                {copy.castButton}
              </Button>
            </>
          )}
          <p className="ws-note">{copy.signIn}</p>
          <p className="ws-note">{copy.note}</p>
        </div>
      </div>
    </section>
  );
}
