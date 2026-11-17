'use client';

import {
  AtSign,
  Bell,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Mail,
  Shield,
} from '@tuturuuu/icons';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import type { Notification } from '@tuturuuu/ui/hooks/use-notifications';

const TYPE_ICON: Record<string, typeof Bell> = {
  task_assigned: ClipboardList,
  task_completed: CheckCircle2,
  task_mention: AtSign,
  task_due_date_changed: Calendar,
  task_start_date_changed: Calendar,
  deadline_reminder: Calendar,
  workspace_invite: Mail,
  security_alert: Shield,
};

/** Compact relative age in the document locale ("25m ago", "3 thg 11"). */
export function formatNotificationAge(createdAt: string, now = Date.now()) {
  const locale =
    typeof document === 'undefined' ? undefined : document.documentElement.lang;
  const seconds = Math.round((new Date(createdAt).getTime() - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale || undefined, {
    style: 'narrow',
    numeric: 'auto',
  });
  const abs = Math.abs(seconds);
  if (abs < 60) return rtf.format(0, 'second');
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), 'minute');
  if (abs < 86_400) return rtf.format(Math.round(seconds / 3600), 'hour');
  if (abs < 7 * 86_400) return rtf.format(Math.round(seconds / 86_400), 'day');
  return new Intl.DateTimeFormat(locale || undefined, {
    day: 'numeric',
    month: 'short',
  }).format(new Date(createdAt));
}

const initials = (name: string | null) =>
  (name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

export function NotificationLeading({
  notification,
}: {
  notification: Notification;
}) {
  const { actor } = notification;
  if (actor?.display_name || actor?.avatar_url) {
    return (
      <Avatar className="size-8">
        {actor.avatar_url && <AvatarImage src={actor.avatar_url} alt="" />}
        <AvatarFallback className="text-[11px]">
          {initials(actor.display_name)}
        </AvatarFallback>
      </Avatar>
    );
  }
  const Icon = TYPE_ICON[notification.type] ?? Bell;
  return (
    <span className="flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
      <Icon aria-hidden className="size-4" />
    </span>
  );
}
