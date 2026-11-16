/** EduFest workshop page: shared types, status helpers, badges and Upskii links. */
import { CircleCheck, CircleDashed, CircleDot } from '@tuturuuu/icons';
import { Fragment, type ReactNode, useMemo } from 'react';
import type en from '../../../messages/edufest-2026.en.json';
// A 96px downscale of the official mark (assets/upskii-official-logo.png):
// it renders at 16-40px, so the 998px original only cost page weight.
import upskiiLogo from '../../assets/upskii-logo-96.png?no-inline';
import { tracks } from '../../content/tracks';
import {
  toWorkshopStatus,
  USE_CASES,
  type UseCase,
  type WorkshopStatus,
} from '../../content/workshops/edufest-2026';
import type { LiveData } from '../../live/model';
import { deriveTracks, indexLiveData } from '../../live/status';

export type EduMessages = typeof en;

export const STATUS_ICON = {
  live: CircleCheck,
  in_progress: CircleDot,
  planned: CircleDashed,
} as const;

export const BY_ID = new Map(USE_CASES.map((item) => [item.id, item]));

export const UPSKII_URL = 'https://upskii.com';

/** The official Upskii mark (upskii/platform official-logo.png), linked. */
export function UpskiiLink({ children = 'Upskii' }: { children?: ReactNode }) {
  return (
    <a
      className="ws-upskii"
      href={UPSKII_URL}
      target="_blank"
      rel="noopener noreferrer"
    >
      <img src={upskiiLogo} alt="" width={16} height={16} loading="lazy" />
      {children}
    </a>
  );
}

/** Upskii shown with its official mark but no link (inside a button). */
export function UpskiiMark({ text }: { text: string }) {
  const parts = text.split(/(Upskii)/);
  return (
    <>
      {parts.map((part, index) =>
        part === 'Upskii' ? (
          <span key={index} className="ws-upskii is-plain">
            <img
              src={upskiiLogo}
              alt=""
              width={16}
              height={16}
              loading="lazy"
            />
            Upskii
          </span>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        )
      )}
    </>
  );
}

/** Text with every "Upskii" mention linked to upskii.com. */
export function UpskiiText({ text }: { text: string }) {
  const parts = text.split(/(Upskii)/);
  return (
    <>
      {parts.map((part, index) =>
        part === 'Upskii' ? (
          <UpskiiLink key={index} />
        ) : (
          <Fragment key={index}>{part}</Fragment>
        )
      )}
    </>
  );
}

/** Every deliverable's page status, derived from the same live data as /roadmap. */
export function useWorkshopStatuses(data: LiveData) {
  return useMemo(() => {
    const statuses = new Map<string, WorkshopStatus>();
    for (const track of deriveTracks(tracks, indexLiveData(data)))
      for (const milestone of track.milestones)
        for (const deliverable of milestone.deliverables)
          statuses.set(
            deliverable.id,
            toWorkshopStatus(deliverable.state.status)
          );
    return statuses;
  }, [data]);
}

export type Statuses = ReadonlyMap<string, WorkshopStatus>;

/** A use case's status; an unknown deliverable reads as planned, never live. */
export function statusOf(item: UseCase, statuses: Statuses): WorkshopStatus {
  return statuses.get(item.deliverable) ?? 'planned';
}

export function WsBadge({
  status,
  t,
}: {
  status: WorkshopStatus;
  t: EduMessages;
}) {
  const Icon = STATUS_ICON[status];
  return (
    <span className={`badge ws-badge ${status}`}>
      <Icon size={13} aria-hidden />
      {t.status[status]}
    </span>
  );
}

export function UseCaseRow({
  id,
  t,
  statuses,
}: {
  id: string;
  t: EduMessages;
  statuses: Statuses;
}) {
  const item = BY_ID.get(id);
  if (!item) return null;
  return (
    <li className="ws-use">
      <span className="ws-use-title">
        {t.capabilities.items[id as keyof EduMessages['capabilities']['items']]}
      </span>
      <span className="ws-use-meta">
        {item.tool === 'upskii' ? (
          <span className="ws-tool">
            <UpskiiLink>{t.tools.names.upskii}</UpskiiLink>
          </span>
        ) : (
          <span className="ws-tool">{t.tools.names[item.tool]}</span>
        )}
        <WsBadge status={statusOf(item, statuses)} t={t} />
      </span>
    </li>
  );
}
