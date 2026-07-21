'use client';

import {
  BarChart3,
  Clock,
  TrendingUp,
  Users,
  Zap,
} from '@tuturuuu/icons/lucide';
import { cn } from '@tuturuuu/utils/format';
import { motion, useReducedMotion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import {
  type DemoAccent,
  DemoCta,
  DemoFrame,
  DemoHeading,
  DemoItem,
  DemoLabel,
  DemoPane,
  demoAccents,
} from './demo-chrome';

const strokeTones: Record<DemoAccent, string> = {
  green: 'stroke-dynamic-green',
  blue: 'stroke-dynamic-blue',
  orange: 'stroke-dynamic-orange',
  purple: 'stroke-dynamic-purple',
  cyan: 'stroke-dynamic-cyan',
};

const barTones: Record<DemoAccent, string> = {
  green: 'bg-dynamic-green',
  blue: 'bg-dynamic-blue',
  orange: 'bg-dynamic-orange',
  purple: 'bg-dynamic-purple',
  cyan: 'bg-dynamic-cyan',
};

/** Parses "65%" / "18.5h" style copy into a number for layout purposes. */
function toNumber(value: string, fallback: number) {
  const parsed = Number.parseFloat(value.replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function Sparkline({
  accent,
  points,
}: {
  accent: DemoAccent;
  points: number[];
}) {
  const reduced = useReducedMotion();
  const max = Math.max(...points);
  const min = Math.min(...points);
  const span = max - min || 1;
  const path = points
    .map((point, index) => {
      const x = (index / (points.length - 1)) * 100;
      const y = 24 - ((point - min) / span) * 20;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg
      aria-hidden="true"
      className="mt-2 h-6 w-full"
      fill="none"
      preserveAspectRatio="none"
      viewBox="0 0 100 28"
    >
      <motion.path
        animate={{ pathLength: 1 }}
        className={cn(strokeTones[accent], 'opacity-70')}
        d={path}
        initial={{ pathLength: reduced ? 1 : 0 }}
        strokeLinecap="round"
        strokeWidth={1.5}
        transition={{ duration: reduced ? 0 : 1, ease: [0.16, 1, 0.3, 1] }}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function MetricCard({
  accent,
  icon: Icon,
  label,
  value,
  change,
  up,
  points,
}: {
  accent: DemoAccent;
  icon: typeof Clock;
  label: string;
  value: string;
  change: string;
  up: boolean;
  points: number[];
}) {
  const styles = demoAccents[accent];

  return (
    <div className="relative overflow-hidden rounded-xl border border-foreground/[0.08] bg-foreground/[0.015] p-3 transition-colors duration-300 hover:bg-foreground/[0.03]">
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent to-transparent',
          styles.rule
        )}
      />
      <div className="flex items-center gap-2">
        <Icon className={cn('h-3 w-3', styles.text)} />
        <DemoLabel className="text-foreground/35">{label}</DemoLabel>
      </div>
      <div className="mt-2 font-display font-semibold text-2xl text-foreground/90 tabular-nums tracking-[-0.03em]">
        {value}
      </div>
      <div
        className={cn(
          'mt-1 flex items-center gap-1',
          up ? styles.text : 'text-foreground/40'
        )}
      >
        <TrendingUp className={cn('h-2.5 w-2.5', !up && 'rotate-180')} />
        <DemoLabel className="tracking-[0.12em]">{change}</DemoLabel>
      </div>
      <Sparkline accent={accent} points={points} />
    </div>
  );
}

function Distribution() {
  const t = useTranslations('landing.demo.analytics.weeklyDistribution');
  const reduced = useReducedMotion();

  const segments: {
    id: string;
    label: string;
    value: string;
    accent: DemoAccent;
  }[] = [
    {
      id: 'deepWork',
      label: t('deepWork.label'),
      value: t('deepWork.value'),
      accent: 'cyan',
    },
    {
      id: 'meetings',
      label: t('meetings.label'),
      value: t('meetings.value'),
      accent: 'purple',
    },
    {
      id: 'admin',
      label: t('admin.label'),
      value: t('admin.value'),
      accent: 'orange',
    },
  ];

  return (
    <div className="border-foreground/[0.06] border-t p-3">
      <DemoLabel className="text-foreground/30">{t('title')}</DemoLabel>
      <div className="mt-2.5 flex h-1.5 gap-0.5 overflow-hidden rounded-full">
        {segments.map((segment, index) => (
          <motion.span
            animate={{ opacity: 1 }}
            className={cn('h-full rounded-full', barTones[segment.accent])}
            initial={{ opacity: reduced ? 1 : 0 }}
            key={segment.id}
            style={{ width: `${toNumber(segment.value, 33)}%` }}
            transition={{
              duration: reduced ? 0 : 0.5,
              delay: reduced ? 0 : 0.15 + index * 0.1,
            }}
          />
        ))}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5">
        {segments.map((segment) => (
          <span className="flex items-center gap-1.5" key={segment.id}>
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                barTones[segment.accent]
              )}
            />
            <DemoLabel className="text-foreground/40">
              {segment.label}
            </DemoLabel>
            <span className="font-mono-ui text-[0.6rem] text-foreground/60 tabular-nums">
              {segment.value}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

function ProductivityScore() {
  const t = useTranslations('landing.demo.analytics.productivityScore');
  const reduced = useReducedMotion();
  const score = toNumber(t('value'), 87);

  return (
    <div className="relative overflow-hidden rounded-xl border border-dynamic-cyan/20 bg-dynamic-cyan/[0.06] p-3.5">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-dynamic-cyan/50 to-transparent"
      />
      <div className="flex items-center justify-between gap-3">
        <DemoLabel className="text-dynamic-cyan">{t('title')}</DemoLabel>
        <span className="rounded-full border border-dynamic-cyan/25 px-2 py-0.5">
          <DemoLabel className="text-dynamic-cyan">{t('badge')}</DemoLabel>
        </span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-foreground/[0.06]">
        <motion.div
          animate={{ scaleX: score / 100 }}
          className="h-full w-full origin-left rounded-full bg-gradient-to-r from-dynamic-cyan to-dynamic-blue"
          initial={{ scaleX: reduced ? score / 100 : 0 }}
          transition={{ duration: reduced ? 0 : 1.1, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>
      <div className="mt-2.5 flex items-center justify-between">
        <span className="font-mono-ui text-[0.68rem] text-foreground/60 tabular-nums">
          {t('value')}
        </span>
        <DemoLabel className="text-foreground/35">{t('rank')}</DemoLabel>
      </div>
    </div>
  );
}

export function AnalyticsDemo() {
  const t = useTranslations('landing.demo.analytics');
  const tabs = useTranslations('landing.demo.tabs');

  const metrics = [
    {
      id: 'tasks',
      accent: 'green' as DemoAccent,
      icon: TrendingUp,
      label: t('metrics.tasks.label'),
      value: t('metrics.tasks.value'),
      change: t('metrics.tasks.change'),
      up: true,
      points: [8, 12, 10, 16, 14, 20, 24],
    },
    {
      id: 'focus',
      accent: 'blue' as DemoAccent,
      icon: Clock,
      label: t('metrics.focus.label'),
      value: t('metrics.focus.value'),
      change: t('metrics.focus.change'),
      up: true,
      points: [9, 11, 10, 13, 15, 14, 18],
    },
    {
      id: 'meetings',
      accent: 'purple' as DemoAccent,
      icon: Users,
      label: t('metrics.meetings.label'),
      value: t('metrics.meetings.value'),
      change: t('metrics.meetings.change'),
      up: false,
      points: [18, 17, 19, 15, 14, 13, 12],
    },
    {
      id: 'goals',
      accent: 'orange' as DemoAccent,
      icon: Zap,
      label: t('metrics.goals.label'),
      value: t('metrics.goals.value'),
      change: t('metrics.goals.subtitle'),
      up: true,
      points: [62, 68, 71, 74, 80, 84, 89],
    },
  ];

  return (
    <DemoPane>
      <DemoItem>
        <DemoHeading
          accent="cyan"
          aside={
            <span className="rounded-full border border-dynamic-cyan/20 bg-dynamic-cyan/[0.06] px-2.5 py-1">
              <DemoLabel className="text-dynamic-cyan">
                {t('productivityScore.badge')}
              </DemoLabel>
            </span>
          }
          kicker={t('subtitle')}
          title={t('title')}
        />
      </DemoItem>

      <DemoItem>
        <DemoFrame accent="cyan" icon={BarChart3} label={tabs('analytics')}>
          <div className="grid grid-cols-2 gap-2.5 p-2.5 lg:grid-cols-4">
            {metrics.map((metric) => (
              <MetricCard
                accent={metric.accent}
                change={metric.change}
                icon={metric.icon}
                key={metric.id}
                label={metric.label}
                points={metric.points}
                up={metric.up}
                value={metric.value}
              />
            ))}
          </div>
          <Distribution />
        </DemoFrame>
      </DemoItem>

      <DemoItem>
        <ProductivityScore />
      </DemoItem>

      <DemoItem>
        <div className="rounded-xl border border-foreground/[0.08] bg-foreground/[0.015] p-3.5">
          <DemoLabel className="text-foreground/35">
            {t('performance.title')}
          </DemoLabel>
          <p className="mt-2 text-[0.8rem] text-foreground/55 leading-relaxed">
            {t('performance.description')}
          </p>
        </div>
      </DemoItem>

      <DemoItem>
        <DemoCta accent="cyan">{t('cta')}</DemoCta>
      </DemoItem>
    </DemoPane>
  );
}
