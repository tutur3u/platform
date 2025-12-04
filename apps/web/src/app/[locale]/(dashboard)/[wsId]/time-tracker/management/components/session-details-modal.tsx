'use client';

import type { SessionWithRelations } from '../../types';
import type { GroupedSession } from '@/lib/time-tracking-helper';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { getInitials } from '@tuturuuu/utils/name-helper';
import { getDescriptionText } from '@tuturuuu/utils/text-helper';
import { Clock, Zap, BarChart3, Activity } from '@tuturuuu/icons';
import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';
import { useTranslations } from 'next-intl';

// Extend dayjs with duration plugin
dayjs.extend(duration);

interface SessionDetailsModalProps {
  isOpen: boolean;
  onClose: (open: boolean) => void;
  session: GroupedSession | null;
  period: 'day' | 'week' | 'month';
}

export default function SessionDetailsModal({
  isOpen,
  onClose,
  session,
  period,
}: SessionDetailsModalProps) {
  const t = useTranslations('time-tracker.management.modal');
  const tPeriod = useTranslations('time-tracker.management.period');

  if (!session) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="flex h-[90vh] w-[95vw] max-w-2xl flex-col overflow-hidden border-dynamic-border/30 bg-linear-to-b from-dynamic-background to-dynamic-muted/20 sm:max-w-4xl md:max-w-5xl lg:max-w-6xl xl:max-w-7xl">
        <DialogHeader className="shrink-0 border-dynamic-border/20 border-b bg-linear-to-r from-dynamic-blue/5 to-dynamic-purple/5 pb-6 pt-6">
          <div className="flex items-center gap-4">
            <div className="relative flex size-12 items-center justify-center rounded-full border-2 border-dynamic-blue/30 bg-linear-to-br from-dynamic-blue/20 to-dynamic-purple/20 sm:size-14">
              <span className="font-bold text-dynamic-blue text-lg sm:text-xl">
                {getInitials(session.user.displayName || 'Unknown User')}
              </span>
              <div className="absolute inset-0 rounded-full bg-linear-to-br from-dynamic-blue/10 to-transparent opacity-0" />
            </div>
            <div className="flex-1">
              <DialogTitle className="bg-linear-to-r from-dynamic-blue to-dynamic-purple bg-clip-text font-bold text-lg text-transparent sm:text-2xl">
                {session.user.displayName || 'Unknown User'}
              </DialogTitle>
              <p className="mt-1 text-dynamic-muted text-sm">
                <span className="inline-block rounded-full bg-dynamic-blue/10 px-3 py-1 text-dynamic-blue font-medium">
                  {t('sessionsCount', { count: session.sessions.length })}
                </span>
                <span className="mx-2 text-dynamic-muted/50">•</span>
                <span className="capitalize">
                  {t('period', { period: tPeriod(period) })}
                </span>
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-6">
            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <StatCard
                icon={<Clock className="h-5 w-5" />}
                value={session.sessions.length}
                label={t('sessionsLabel')}
                colorClass="dynamic-blue"
              />
              <StatCard
                icon={<Zap className="h-5 w-5" />}
                value={dayjs
                  .duration(
                    session.periodDuration ?? session.totalDuration,
                    'seconds'
                  )
                  .format('H:mm:ss')}
                label={t('totalTime')}
                colorClass="dynamic-green"
              />
              <StatCard
                icon={<BarChart3 className="h-5 w-5" />}
                value={dayjs
                  .duration(
                    (session.periodDuration ?? session.totalDuration) /
                      session.sessions.length,
                    'seconds'
                  )
                  .format('H:mm:ss')}
                label={t('avgSession')}
                colorClass="dynamic-yellow"
              />
              <StatCard
                icon={<Activity className="h-5 w-5" />}
                value={session.sessions.filter((s) => s.is_running).length}
                label={t('active')}
                colorClass="dynamic-purple"
              />
            </div>

            {/* Session List */}
            <div className="rounded-lg border border-dynamic-border/20 bg-dynamic-muted/5 p-5 backdrop-blur-sm">
              <h4 className="mb-4 flex items-center gap-2 font-bold text-dynamic-foreground text-lg">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-linear-to-br from-dynamic-blue/20 to-dynamic-purple/20">
                  <Clock className="h-4 w-4 text-dynamic-blue" />
                </div>
                {t('sessionDetails')}
              </h4>
              <div className="space-y-2">
                {session.sessions.length === 0 ? (
                  <div className="py-8 text-center text-dynamic-muted text-sm">
                    {t('noSessionsFound')}
                  </div>
                ) : (
                  session.sessions
                    .sort(
                      (a, b) =>
                        new Date(b.start_time).getTime() -
                        new Date(a.start_time).getTime()
                    )
                    .map((sessionItem, index) => (
                      <SessionListItem
                        key={sessionItem.id}
                        session={sessionItem}
                        index={index}
                      />
                    ))
                )}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Sub-components
interface StatCardProps {
  icon: React.ReactNode;
  value: string | number;
  label: string;
  colorClass: string;
}

function StatCard({ icon, value, label, colorClass }: StatCardProps) {
  const colorMap: Record<
    string,
    { bg: string; text: string; icon: string; iconBg: string }
  > = {
    'dynamic-blue': {
      bg: 'bg-dynamic-blue/5 border-dynamic-blue/30',
      text: 'text-dynamic-blue',
      icon: 'text-dynamic-blue',
      iconBg: 'bg-linear-to-br from-dynamic-blue/20 to-dynamic-blue/10',
    },
    'dynamic-green': {
      bg: 'bg-dynamic-green/5 border-dynamic-green/30',
      text: 'text-dynamic-green',
      icon: 'text-dynamic-green',
      iconBg: 'bg-linear-to-br from-dynamic-green/20 to-dynamic-green/10',
    },
    'dynamic-yellow': {
      bg: 'bg-dynamic-yellow/5 border-dynamic-yellow/30',
      text: 'text-dynamic-yellow',
      icon: 'text-dynamic-yellow',
      iconBg: 'bg-linear-to-br from-dynamic-yellow/20 to-dynamic-yellow/10',
    },
    'dynamic-purple': {
      bg: 'bg-dynamic-purple/5 border-dynamic-purple/30',
      text: 'text-dynamic-purple',
      icon: 'text-dynamic-purple',
      iconBg: 'bg-linear-to-br from-dynamic-purple/20 to-dynamic-purple/10',
    },
  };

  const colorsOrDefault = colorMap[colorClass];
  if (!colorsOrDefault) {
    return null;
  }

  return (
    <div
      className={`group relative overflow-hidden rounded-xl border-2 ${colorsOrDefault.bg} p-4 transition-all duration-300 hover:shadow-lg`}
    >
      <div className="absolute inset-0 bg-linear-to-br from-white/20 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      <div className="relative flex items-start gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${colorsOrDefault.iconBg}`}
        >
          <div className={colorsOrDefault.icon}>{icon}</div>
        </div>
        <div className="flex-1">
          <div className={`font-bold text-2xl ${colorsOrDefault.text}`}>
            {value}
          </div>
          <div className="text-dynamic-muted text-xs font-medium">{label}</div>
        </div>
      </div>
    </div>
  );
}

interface SessionListItemProps {
  session: SessionWithRelations;
  index: number;
}

function SessionListItem({ session, index }: SessionListItemProps) {
  const t = useTranslations('time-tracker.management.modal');
  const isActive = session.is_running;

  return (
    <div
      className={`group relative overflow-hidden rounded-lg border-2 transition-all duration-300 ${
        isActive
          ? 'border-dynamic-green/40 bg-linear-to-r from-dynamic-green/5 to-dynamic-blue/5 shadow-sm shadow-dynamic-green/10'
          : 'border-dynamic-border/20 bg-dynamic-muted/5 hover:border-dynamic-border/40'
      }`}
      style={{
        animationDelay: `${index * 50}ms`,
      }}
    >
      <div
        className={`absolute inset-0 bg-linear-to-r from-dynamic-blue/10 to-dynamic-purple/10 opacity-0 transition-opacity duration-300 ${
          isActive ? 'opacity-50' : 'group-hover:opacity-30'
        }`}
      />
      <div className="relative p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h5 className="font-semibold text-dynamic-foreground">
                {session.title || t('untitledSession')}
              </h5>
              {session.category && (
                <span
                  className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold text-white/95 shadow-sm"
                  style={{
                    backgroundColor: session.category.color || '#3b82f6',
                  }}
                >
                  {session.category.name}
                </span>
              )}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-dynamic-muted">
              <div className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {dayjs(session.start_time).format('MMM D, YYYY')} - {' '}
                {dayjs(session.start_time).format('HH:mm')}
              </div>
              {session.end_time ? (
                <div className="flex items-center gap-1">
                  <span className="text-dynamic-muted/50">→</span>
                                    {!dayjs(session.start_time).isSame(
                    session.end_time,
                    'day'
                  ) && (
                    <span className="text-dynamic-muted/70">
                      {dayjs(session.end_time).format('MMM D, YYYY')} - {' '}
                    </span>
                  )}
                  {dayjs(session.end_time).format('HH:mm')}

                </div>
              ) : (
                <span className="animate-pulse font-medium text-dynamic-green">
                  {t('ongoing')}
                </span>
              )}
            </div>
            {session.description && (
              <div className="mt-3 rounded-md border border-dynamic-border/10 bg-dynamic-muted/20 p-3 text-xs text-dynamic-muted">
                {getDescriptionText(session.description)}
              </div>
            )}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <div className="font-mono font-bold text-dynamic-foreground text-lg">
              {session.duration_seconds
                ? dayjs
                    .duration(session.duration_seconds, 'seconds')
                    .format('H:mm:ss')
                : '0:00:00'}
            </div>
            {isActive && (
              <div className="flex items-center gap-1.5 rounded-full bg-dynamic-green/20 px-2.5 py-1 text-dynamic-green text-xs font-semibold">
                <div className="size-2 animate-pulse rounded-full bg-dynamic-green" />
                {t('activeBadge')}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
