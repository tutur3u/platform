/** EduFest workshop page: the run of show, each step with its readiness and open bugs. */
import { ArrowRight } from '@tuturuuu/icons';
import { useMemo } from 'react';
import { VERDICTS } from '../../content/workshops/edufest-2026-readiness';
import {
  type Lead,
  minutesLabel,
  type Product,
  RUN_OF_SHOW,
  type RunStep,
  shortDate,
  stepReadiness,
  vietnamDay,
} from '../../content/workshops/edufest-2026-run';
import { type BugFeed, groupBugs } from '../../live/edufest-bugs';
import type { Lang } from '../shared';
import { StepReady } from './run-readiness';
import {
  type EduMessages,
  fill,
  type Statuses,
  UpskiiMark,
  UpskiiText,
} from './shared';

export const HOST_EVENT_URL = 'https://ieeai.net/edufest';

function ProductMark({ product, t }: { product: Product; t: EduMessages }) {
  return product === 'upskii' ? (
    <span className="ws-tool">
      <UpskiiMark text={t.tools.names.upskii} />
    </span>
  ) : (
    <span className="ws-tool">{t.tools.names[product]}</span>
  );
}

/** "Cường → Phúc" on a handover step, "Phúc · Cường" when both lead. */
function StepLead({ step, t }: { step: RunStep; t: EduMessages }) {
  const names = step.leads.map((lead: Lead) => t.agenda.leads[lead]);
  const lead = names.join(step.handover ? ' → ' : ' · ');
  return <p className="ws-run-lead">{fill(t.agenda.leadBy, { lead })}</p>;
}

function StepTime({ step, t }: { step: RunStep; t: EduMessages }) {
  const label = minutesLabel(step);
  return (
    <div className="ws-run-time">
      <span className="ws-run-code">{step.id.toUpperCase()}</span>
      <span className="ws-run-mins">
        {label.kind === 'before'
          ? fill(t.agenda.time.before, { n: label.minutes })
          : fill(t.agenda.time.range, { start: label.start, end: label.end })}
      </span>
      <span className="ws-run-len">
        {fill(t.agenda.time.duration, { n: step.end - step.start })}
      </span>
    </div>
  );
}

export function WsAgenda({
  t,
  lang,
  statuses,
  now,
  bugs,
}: {
  t: EduMessages;
  lang: Lang;
  statuses: Statuses;
  now: number;
  bugs: BugFeed;
}) {
  const grouped = useMemo(() => groupBugs(bugs), [bugs]);
  // The newest of the rehearsal checks and the bug list's observation.
  const updated = [
    ...Object.values(VERDICTS).map((verdict) => vietnamDay(verdict.checkedAt)),
    bugs.state === 'observed' ? Date.parse(bugs.observedAt) : 0,
  ].reduce((a, b) => Math.max(a, b), 0);
  return (
    <section className="section ws-run" aria-labelledby="ws-agenda">
      <header className="section-head">
        <h2 id="ws-agenda">{t.agenda.title}</h2>
        <p>
          <UpskiiText text={t.agenda.subtitle} />
        </p>
        <p className="ws-run-meta">
          <a href={HOST_EVENT_URL} target="_blank" rel="noopener noreferrer">
            {t.agenda.host}
          </a>
          <span>{t.agenda.timesNote}</span>
          {updated ? (
            <span>
              {fill(t.agenda.updated, {
                date: shortDate(new Date(updated).toISOString(), lang),
              })}
            </span>
          ) : null}
        </p>
      </header>
      <ol className="ws-run-list">
        {RUN_OF_SHOW.map((step) => {
          const id = step.id;
          return (
            <li key={id} className="ws-run-step" data-step={id}>
              <StepTime step={step} t={t} />
              <div className="ws-run-card">
                <div className="ws-run-tags">
                  <span className={`ws-seat ${step.seat}`}>
                    {t.agenda.seats[step.seat]}
                  </span>
                  {step.products.map((product) => (
                    <ProductMark key={product} product={product} t={t} />
                  ))}
                  {step.handover ? (
                    <span className="ws-run-handover">
                      {t.agenda.handover}
                      <span>{t.tools.names[step.handover.from]}</span>
                      <ArrowRight size={13} aria-hidden />
                      <span>{t.tools.names[step.handover.to]}</span>
                    </span>
                  ) : null}
                </div>
                <h3>
                  <UpskiiText text={t.agenda.items[id].title} />
                </h3>
                <StepLead step={step} t={t} />
                <p>
                  <UpskiiText text={t.agenda.items[id].body} />
                </p>
                <StepReady
                  t={t}
                  lang={lang}
                  readiness={stepReadiness(step, VERDICTS[id], statuses, now)}
                  bugs={grouped[id]}
                />
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
