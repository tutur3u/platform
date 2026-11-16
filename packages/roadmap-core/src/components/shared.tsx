import {
  CircleCheck,
  CircleDashed,
  CircleDot,
  CloudUpload,
  GitPullRequestArrow,
} from '@tuturuuu/icons';
import type { ReactNode } from 'react';
import type en from '../../messages/en.json';
import { REPO_URL } from '../live/model';
import type { Status } from '../live/status';
import { InfoPopover, Tooltip } from './info';

export type Messages = typeof en;

export type Lang = 'en' | 'vi';

export const TIME_ZONE = 'Asia/Ho_Chi_Minh';

export const STATUS_ICON: Record<Status, typeof CircleCheck> = {
  live: CircleCheck,
  waiting_for_prod_sync: CloudUpload,
  waiting_for_merge: GitPullRequestArrow,
  in_progress: CircleDot,
  planned: CircleDashed,
};

export function formatDate(iso: string, lang: Lang, withTime = false) {
  return new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'vi-VN', {
    day: 'numeric',
    month: 'short',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
    timeZone: TIME_ZONE,
  }).format(new Date(iso));
}

export function dayLabel(day: string, today: string, t: Messages, lang: Lang) {
  if (day === today) return t.shipped.today;
  const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - 86_400_000)
    .toISOString()
    .slice(0, 10);
  if (day === yesterday) return t.shipped.yesterday;
  return new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'vi-VN', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${day}T00:00:00Z`));
}

/**
 * A section heading. Its explanation, when it has one, sits behind an (i)
 * button beside the heading; a short `subtitle` stays visible.
 */
export function SectionHead({
  id,
  title,
  subtitle,
  info,
  t,
}: {
  id: string;
  title: string;
  subtitle?: string;
  info?: ReactNode;
  t: Messages;
}) {
  return (
    <header className="section-head">
      <SectionTitle id={id} title={title} info={info} t={t} />
      {subtitle ? <p>{subtitle}</p> : null}
    </header>
  );
}

/** The heading row: the h2 and, when there is one, its (i) button. */
export function SectionTitle({
  id,
  title,
  info,
  t,
}: {
  id: string;
  title: string;
  info?: ReactNode;
  t: Messages;
}) {
  return (
    <div className="section-title">
      <h2 id={id}>{title}</h2>
      {info ? (
        <InfoPopover
          id={`${id}-about`}
          label={t.info.about.replace('{title}', title)}
          title={title}
          closeLabel={t.info.close}
        >
          {info}
        </InfoPopover>
      ) : null}
    </div>
  );
}

/**
 * A status label. With `tipId` it is a tooltip trigger whose tooltip holds
 * the status definition (the same text as "How statuses are computed").
 */
export function StatusBadge({
  status,
  t,
  tipId,
}: {
  status: Status;
  t: Messages;
  tipId?: string;
}) {
  const Icon = STATUS_ICON[status];
  const label = (
    <>
      <Icon size={13} aria-hidden />
      {t.status[status]}
    </>
  );
  if (!tipId) return <span className={`badge ${status}`}>{label}</span>;
  return (
    <Tooltip id={tipId} tip={t.method[status]} className={`badge ${status}`}>
      {label}
    </Tooltip>
  );
}

export function PrLinks({ prs }: { prs: { number: number }[] }) {
  if (!prs.length) return null;
  return (
    <span className="prs">
      {prs.map((pr) => (
        <a key={pr.number} href={`${REPO_URL}/pull/${pr.number}`}>
          #{pr.number}
        </a>
      ))}
    </span>
  );
}
