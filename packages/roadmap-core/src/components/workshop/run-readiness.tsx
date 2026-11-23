/** EduFest run of show: one step's derived status, rehearsal verdict and open bugs. */
import {
  Bug,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  Clock,
  OctagonX,
} from '@tuturuuu/icons';
import {
  type Readiness,
  shortDate,
  type StepReadiness,
} from '../../content/workshops/edufest-2026-run';
import { issueUrl, type StepBugs } from '../../live/edufest-bugs';
import { REPO_URL } from '../../live/model';
import type { Lang } from '../shared';
import { type EduMessages, fill, WsBadge } from './shared';

const VERDICT_ICON = {
  ready: CircleCheck,
  at_risk: CircleAlert,
  blocked: OctagonX,
  missing: CircleDashed,
} as const;

/** Every open EduFest bug, on GitHub. */
export const ALL_BUGS_URL = `${REPO_URL}/issues?q=${encodeURIComponent(
  'is:issue is:open label:edufest-2026'
)}`;

function VerdictChip({
  readiness,
  t,
}: {
  readiness: Readiness;
  t: EduMessages;
}) {
  const Icon = VERDICT_ICON[readiness];
  return (
    <span className={`badge ws-verdict ${readiness}`}>
      <Icon size={13} aria-hidden />
      {t.agenda.ready.readiness[readiness]}
    </span>
  );
}

function Rehearsal({
  readiness,
  t,
  lang,
}: {
  readiness: StepReadiness;
  t: EduMessages;
  lang: Lang;
}) {
  const r = t.agenda.ready;
  switch (readiness.kind) {
    case 'unchecked':
      return <span className="badge ws-verdict missing">{r.unchecked}</span>;
    case 'stale':
      return (
        <>
          <span className="badge ws-verdict stale">
            <Clock size={13} aria-hidden />
            {r.stale}
          </span>
          <span className="ws-run-note">
            {fill(r.lastChecked, {
              date: shortDate(readiness.verdict.checkedAt, lang),
            })}
          </span>
        </>
      );
    case 'checked':
      return (
        <>
          <VerdictChip readiness={readiness.verdict.readiness} t={t} />
          {readiness.overdue ? (
            <span className="badge ws-verdict blocked">{r.overdue}</span>
          ) : null}
          <span className="ws-run-note">
            {fill(r.checked, {
              date: shortDate(readiness.verdict.checkedAt, lang),
            })}
          </span>
        </>
      );
  }
}

function Bugs({ bugs, t }: { bugs: StepBugs; t: EduMessages }) {
  const b = t.agenda.bugs;
  if (bugs.state === 'unavailable')
    return (
      <p className="ws-run-bugs is-unavailable">
        <Bug size={14} aria-hidden />
        <a href={ALL_BUGS_URL} target="_blank" rel="noopener noreferrer">
          {b.unavailable}
        </a>
      </p>
    );
  if (!bugs.count)
    return (
      <p className="ws-run-bugs">
        <Bug size={14} aria-hidden />
        {b.none}
      </p>
    );
  const hidden = bugs.count - bugs.shown.length;
  return (
    <div className="ws-run-bugs has-bugs">
      <p>
        <Bug size={14} aria-hidden />
        {bugs.count === 1 ? b.one : fill(b.many, { n: bugs.count })}
      </p>
      <ul>
        {bugs.shown.map((bug) => (
          <li key={bug.number}>
            <a
              href={issueUrl(bug.number)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="ws-run-issue">#{bug.number}</span> {bug.title}
            </a>
          </li>
        ))}
        {hidden > 0 ? (
          <li>
            <a href={ALL_BUGS_URL} target="_blank" rel="noopener noreferrer">
              {fill(b.more, { n: hidden })}
            </a>
          </li>
        ) : null}
      </ul>
    </div>
  );
}

export function StepReady({
  t,
  lang,
  readiness,
  bugs,
}: {
  t: EduMessages;
  lang: Lang;
  readiness: StepReadiness;
  bugs: StepBugs;
}) {
  const r = t.agenda.ready;
  const verdict = readiness.kind === 'unchecked' ? null : readiness.verdict;
  return (
    <div className="ws-run-ready" aria-label={r.label} role="group">
      <dl className="ws-run-status">
        <div>
          <dt>{r.roadmap}</dt>
          <dd>
            {readiness.derived ? (
              <WsBadge status={readiness.derived} t={t} />
            ) : (
              <span className="ws-run-note">{r.noProduct}</span>
            )}
          </dd>
        </div>
        <div>
          <dt>{r.rehearsal}</dt>
          <dd>
            <Rehearsal readiness={readiness} t={t} lang={lang} />
          </dd>
        </div>
      </dl>
      {verdict ? (
        <p className="ws-run-left">
          <span className="ws-run-owner">
            {r.teams[verdict.owner]}
            {verdict.nextEta
              ? ` · ${fill(r.next, { date: shortDate(verdict.nextEta, lang) })}`
              : ''}
          </span>
          {verdict.left[lang]}
        </p>
      ) : null}
      <Bugs bugs={bugs} t={t} />
    </div>
  );
}
