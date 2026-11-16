/** EduFest workshop page: agenda, highlights, seat swap and the experience list. */
import {
  CircleCheck,
  GraduationCap,
  NotebookPen,
  Sparkles,
  Users,
} from '@tuturuuu/icons';
import {
  AGENDA,
  EXPERIENCES,
  HIGHLIGHTS,
  OUTCOMES,
} from '../../content/workshops/edufest-2026';
import { type EduMessages, UpskiiText } from './shared';

export function WsAgenda({ t }: { t: EduMessages }) {
  return (
    <section className="section" aria-labelledby="ws-agenda">
      <header className="section-head">
        <h2 id="ws-agenda">{t.agenda.title}</h2>
        <p>{t.agenda.subtitle}</p>
      </header>
      <div className="ws-two">
        <ol className="ws-agenda">
          {AGENDA.map((id, index) => (
            <li key={id}>
              <span className="ws-num" aria-hidden>
                {index + 1}
              </span>
              <div>
                <h3>
                  <UpskiiText text={t.agenda.items[id].title} />
                </h3>
                <p>
                  <UpskiiText text={t.agenda.items[id].body} />
                </p>
              </div>
            </li>
          ))}
        </ol>
        <div className="ws-card">
          <h3>{t.outcomes.title}</h3>
          <ul className="ws-outcomes">
            {OUTCOMES.map((id) => (
              <li key={id}>
                <CircleCheck size={16} aria-hidden />
                {t.outcomes.items[id]}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

const HIGHLIGHT_ICON = {
  seat: Users,
  agents: Sparkles,
  early: GraduationCap,
  plan: NotebookPen,
} as const;

export function WsHighlights({ t }: { t: EduMessages }) {
  return (
    <section className="section" aria-labelledby="ws-highlights">
      <header className="section-head">
        <h2 id="ws-highlights">{t.highlights.title}</h2>
      </header>
      <ul className="ws-highlights">
        {HIGHLIGHTS.map((id) => {
          const Icon = HIGHLIGHT_ICON[id];
          return (
            <li key={id} className="ws-card">
              <span className="ws-highlight-icon" aria-hidden>
                <Icon size={20} />
              </span>
              <h3>{t.highlights.items[id].title}</h3>
              <p>{t.highlights.items[id].body}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Seat-swap illustration: decorative, described once for screen readers. */
export function WsSeatSwap({ t }: { t: EduMessages }) {
  const rows = [0, 1, 2];
  const cols = [0, 1];
  return (
    <svg
      className="ws-illustration"
      viewBox="0 0 340 170"
      role="img"
      aria-label={t.illustration.label}
    >
      {/* The front of the room: board, empty teacher desk, the teacher leaving. */}
      <rect
        x="22"
        y="16"
        width="96"
        height="9"
        rx="4.5"
        className="ws-ill-board"
      />
      <rect
        x="36"
        y="56"
        width="68"
        height="24"
        rx="8"
        className="ws-ill-desk teacher"
      />
      <circle cx="70" cy="44" r="9" className="ws-ill-person teacher" />
      {/* The move to the student seat. */}
      <path d="M112 52 C 150 18, 196 22, 214 46" className="ws-ill-arrow" />
      <path d="M205 42 L 215 48 L 216 37" className="ws-ill-arrow" />
      {/* Student desks, each learner sitting behind one. */}
      {rows.map((row) =>
        cols.map((col) => {
          const x = 206 + col * 66;
          const y = 62 + row * 36;
          const swapped = row === 0 && col === 0;
          return (
            <g key={`${row}-${col}`}>
              <circle
                cx={x + 22}
                cy={y - 2}
                r="7.5"
                className={`ws-ill-person${swapped ? ' student' : ''}`}
              />
              <rect
                x={x}
                y={y + 6}
                width="44"
                height="16"
                rx="5"
                className="ws-ill-desk"
              />
            </g>
          );
        })
      )}
      {/* The AI agent, linked to every row. */}
      <g className="ws-ill-agent">
        <rect x="130" y="112" width="40" height="28" rx="9" />
        <circle cx="143" cy="126" r="3" />
        <circle cx="157" cy="126" r="3" />
      </g>
      {rows.map((row) => (
        <path
          key={row}
          d={`M170 126 L 202 ${76 + row * 36}`}
          className="ws-ill-link"
        />
      ))}
    </svg>
  );
}

export function WsExperience({ t }: { t: EduMessages }) {
  return (
    <section className="section" aria-labelledby="ws-experience">
      <header className="section-head">
        <h2 id="ws-experience">{t.experience.title}</h2>
        <p>{t.experience.subtitle}</p>
      </header>
      <ul className="ws-experience">
        {EXPERIENCES.map((item) => (
          <li key={item.id} className="ws-card">
            <span className={`ws-seat ${item.seat}`}>
              {t.experience.seats[item.seat]}
            </span>
            <p>
              {
                t.experience.items[
                  item.id as keyof EduMessages['experience']['items']
                ]
              }
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
