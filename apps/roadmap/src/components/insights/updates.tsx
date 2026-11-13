import { Fragment, useEffect, useState, useSyncExternalStore } from 'react';
import {
  previousVisit,
  rememberVisit,
  sinceIndex,
} from '../../insights/last-visit';
import type { ProductionUpdate } from '../../insights/production';
import type { TrackedPr } from '../../insights/tracked';
import { APP_NAMES } from '../../live/host-probe';
import { REPO_URL } from '../../live/model';
import { formatDate, type Lang, type Messages } from '../shared';
import { plural } from './delta';

/** Builds rendered with the page; the rest render on request (smaller HTML). */
const SHOWN = 3;
const ITEMS = 3;

const noop = () => () => {};

/** Tracked PRs grouped by deliverable, newest first. */
function byDeliverable(prs: readonly TrackedPr[]) {
  const groups = new Map<string, number[]>();
  for (const pr of prs) {
    const list = groups.get(pr.deliverable) ?? [];
    list.push(pr.number);
    groups.set(pr.deliverable, list);
  }
  return [...groups].map(([title, numbers]) => ({ title, numbers }));
}

function Items({
  prs,
  t,
  lang,
}: {
  prs: readonly TrackedPr[];
  t: Messages;
  lang: Lang;
}) {
  const groups = byDeliverable(prs);
  return (
    <ul className="update-items">
      {groups.slice(0, ITEMS).map((group) => (
        <li key={group.title}>
          <span>{group.title}</span>{' '}
          {group.numbers.map((number) => (
            <a
              key={number}
              href={`${REPO_URL}/pull/${number}`}
              className="pr-link"
            >
              #{number}
            </a>
          ))}
        </li>
      ))}
      {groups.length > ITEMS ? (
        <li className="update-more">
          {plural(t.updates.more, groups.length - ITEMS, lang)}
        </li>
      ) : null}
    </ul>
  );
}

function Update({
  update,
  t,
  lang,
  isNew,
}: {
  update: ProductionUpdate;
  t: Messages;
  lang: Lang;
  isNew: boolean;
}) {
  return (
    <li className={`update${isNew ? ' is-new' : ''}`}>
      <div className="update-when">
        <time dateTime={update.at}>{formatDate(update.at, lang, true)}</time>
        <small>{update.builtAt ? t.updates.built : t.updates.commitTime}</small>
      </div>
      <div className="update-body">
        <h3>
          {APP_NAMES[update.app] ?? update.app}
          <a
            className="update-commit"
            href={`${REPO_URL}/commit/${update.commit}`}
          >
            {update.commit.slice(0, 7)}
          </a>
          {isNew ? <span className="update-new">{t.updates.new}</span> : null}
        </h3>
        <p className="update-counts">
          <span className="count-live">
            {plural(t.updates.liveCount, update.live.length, lang)}
          </span>
          {update.waiting.length ? (
            <span className="count-waiting">
              {plural(t.updates.waitingCount, update.waiting.length, lang)}
            </span>
          ) : null}
        </p>
        {update.live.length ? (
          <Items prs={update.live} t={t} lang={lang} />
        ) : null}
        {update.waiting.length ? (
          <details className="update-waiting">
            <summary>{t.updates.waiting}</summary>
            <Items prs={update.waiting} t={t} lang={lang} />
          </details>
        ) : null}
      </div>
    </li>
  );
}

/**
 * Recent production updates: each app's production build, newest first, with
 * the roadmap work it runs and what still waits for its next deploy. A
 * divider marks what is new since this browser's last visit.
 */
export function ProductionUpdates({
  t,
  lang,
  updates,
}: {
  t: Messages;
  lang: Lang;
  updates: readonly ProductionUpdate[];
}) {
  // Server and hydration render without a marker; the client reads it once.
  const lastVisit = useSyncExternalStore(noop, previousVisit, () => null);
  useEffect(() => {
    rememberVisit(Date.now());
  }, []);
  const marker = sinceIndex(
    updates.map((update) => update.at),
    lastVisit
  );
  const [expanded, setExpanded] = useState(false);
  const first = updates.slice(0, expanded ? updates.length : SHOWN);
  const hidden = updates.length - first.length;
  const render = (list: readonly ProductionUpdate[], offset: number) =>
    list.map((update, index) => (
      <Fragment key={update.app}>
        {marker !== null &&
        marker > 0 &&
        marker < updates.length &&
        marker === index + offset ? (
          <li className="since-marker">
            <span>{t.updates.sinceLastVisit}</span>
          </li>
        ) : null}
        <Update
          update={update}
          t={t}
          lang={lang}
          isNew={marker !== null && index + offset < marker}
        />
      </Fragment>
    ));
  return (
    <section
      className="section updates"
      id="updates"
      aria-labelledby="updates-title"
    >
      <header className="section-head">
        <h2 id="updates-title">{t.updates.title}</h2>
        <p>{t.updates.subtitle}</p>
      </header>
      {updates.length ? (
        <>
          <ol className="update-list">{render(first, 0)}</ol>
          {hidden > 0 ? (
            <button
              type="button"
              className="update-rest"
              aria-expanded={false}
              onClick={() => setExpanded(true)}
            >
              {plural(t.updates.more, hidden, lang)}
            </button>
          ) : null}
        </>
      ) : (
        <p className="updates-empty">{t.updates.empty}</p>
      )}
    </section>
  );
}
