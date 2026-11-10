import {
  CircleCheck,
  CircleDashed,
  CircleDot,
  CloudUpload,
  GitPullRequestArrow,
} from '@tuturuuu/icons';
import type en from '../../messages/en.json';
import { REPO_URL } from '../live/model';
import type { Status } from '../live/status';

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

export function SectionHead({
  id,
  title,
  subtitle,
}: {
  id: string;
  title: string;
  subtitle: string;
}) {
  return (
    <header className="section-head">
      <h2 id={id}>{title}</h2>
      <p>{subtitle}</p>
    </header>
  );
}

export function StatusBadge({ status, t }: { status: Status; t: Messages }) {
  const Icon = STATUS_ICON[status];
  return (
    <span className={`badge ${status}`}>
      <Icon size={13} aria-hidden />
      {t.status[status]}
    </span>
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
