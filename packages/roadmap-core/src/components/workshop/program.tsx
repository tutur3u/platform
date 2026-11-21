/** EduFest workshop page: the agenda as a timeline, with the seat you sit in. */
import { AGENDA } from '../../content/workshops/edufest-2026';
import { AGENDA_SEATS } from '../../content/workshops/edufest-2026-demos';
import { type EduMessages, UpskiiText } from './shared';

export function WsAgenda({ t }: { t: EduMessages }) {
  return (
    <section className="section" aria-labelledby="ws-agenda">
      <header className="section-head">
        <h2 id="ws-agenda">{t.agenda.title}</h2>
        <p>{t.agenda.subtitle}</p>
      </header>
      <ol className="ws-timeline">
        {AGENDA.map((id, index) => {
          const seat = AGENDA_SEATS[id];
          return (
            <li key={id} className="ws-tl-item">
              <span className="ws-tl-node" aria-hidden>
                {index + 1}
              </span>
              <div className="ws-tl-card">
                <span className={`ws-seat ${seat}`}>
                  {t.agenda.seats[seat]}
                </span>
                <h3>
                  <UpskiiText text={t.agenda.items[id].title} />
                </h3>
                <p>
                  <UpskiiText text={t.agenda.items[id].body} />
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
