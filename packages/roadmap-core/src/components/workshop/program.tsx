/** EduFest workshop page: the agenda. */
import { AGENDA } from '../../content/workshops/edufest-2026';
import { type EduMessages, UpskiiText } from './shared';

export function WsAgenda({ t }: { t: EduMessages }) {
  return (
    <section className="section" aria-labelledby="ws-agenda">
      <header className="section-head">
        <h2 id="ws-agenda">{t.agenda.title}</h2>
        <p>{t.agenda.subtitle}</p>
      </header>
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
    </section>
  );
}
