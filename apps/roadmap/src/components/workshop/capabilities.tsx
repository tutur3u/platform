/** EduFest workshop page: the capability explorer with role and status filters. */
import { useState } from 'react';
import {
  CAPABILITIES,
  ROLES,
  type Role,
  USE_CASES,
  type WorkshopStatus,
} from '../../content/workshops/edufest-2026';
import {
  type EduMessages,
  type Statuses,
  statusOf,
  UseCaseRow,
} from './shared';

type RoleFilter = 'all' | Role;
type StatusFilter = 'all' | WorkshopStatus;
const STATUS_FILTERS: StatusFilter[] = [
  'all',
  'live',
  'in_progress',
  'planned',
];

/**
 * Capabilities grouped by what they do, with the role and status explorer
 * on top: one list, filtered in place, so nothing is shown twice.
 */
export function WsCapabilities({
  t,
  statuses,
}: {
  t: EduMessages;
  statuses: Statuses;
}) {
  const [role, setRole] = useState<RoleFilter>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const shown = USE_CASES.filter(
    (item) =>
      (role === 'all' || item.roles.includes(role)) &&
      (status === 'all' || statusOf(item, statuses) === status)
  );
  const groups = CAPABILITIES.map((group) => ({
    group,
    items: shown.filter((item) => item.capability === group),
  })).filter((entry) => entry.items.length > 0);
  return (
    <section className="section" aria-labelledby="ws-capabilities">
      <header className="section-head">
        <h2 id="ws-capabilities">{t.capabilities.title}</h2>
        <p>{t.capabilities.subtitle}</p>
      </header>
      <p className="ws-honesty">{t.capabilities.honesty}</p>
      <div className="ws-explore" role="group" aria-labelledby="ws-explorer">
        <h3 id="ws-explorer">{t.explorer.title}</h3>
        <div className="ws-filters">
          <fieldset className="segmented filters">
            <legend className="sr-only">{t.explorer.role}</legend>
            {(['all', ...ROLES] as RoleFilter[]).map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={role === item}
                onClick={() => setRole(item)}
              >
                {item === 'all' ? t.explorer.all : t.explorer.roles[item]}
              </button>
            ))}
          </fieldset>
          <fieldset className="segmented filters">
            <legend className="sr-only">{t.explorer.status}</legend>
            {STATUS_FILTERS.map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={status === item}
                onClick={() => setStatus(item)}
              >
                {item === 'all' ? t.explorer.all : t.status[item]}
              </button>
            ))}
          </fieldset>
        </div>
        <p className="ws-count" aria-live="polite">
          {shown.length} {t.explorer.shown}
        </p>
      </div>
      {groups.length ? (
        <div className="ws-groups masonry">
          {groups.map(({ group, items }) => (
            <div key={group} className="ws-card">
              <h3>{t.capabilities.groups[group]}</h3>
              <ul className="ws-uses">
                {items.map((item) => (
                  <UseCaseRow
                    key={item.id}
                    id={item.id}
                    t={t}
                    statuses={statuses}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <p className="empty">{t.explorer.none}</p>
      )}
    </section>
  );
}
