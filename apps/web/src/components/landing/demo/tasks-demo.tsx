'use client';

import { CheckCircle2, Sparkles } from '@tuturuuu/icons/lucide';
import { cn } from '@tuturuuu/utils/format';
import { motion, useReducedMotion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import {
  DemoCta,
  DemoFrame,
  DemoHeading,
  DemoItem,
  DemoLabel,
  DemoPane,
  DemoPulse,
} from './demo-chrome';
import { KanbanDemo } from './kanban-demo';

export function TasksDemo() {
  const t = useTranslations('landing.demo.taskManagement');
  const tabs = useTranslations('landing.demo.tabs');
  const kanban = useTranslations('landing.demo.kanban');

  return (
    <DemoPane>
      <DemoItem>
        <DemoHeading
          accent="green"
          kicker={t('subtitle')}
          title={t('title')}
          aside={<BoardLegend />}
        />
      </DemoItem>

      <DemoItem>
        <DemoFrame
          accent="green"
          icon={CheckCircle2}
          label={tabs('tasks')}
          meta={
            <>
              <DemoPulse accent="green" />
              <DemoLabel className="hidden text-foreground/40 sm:inline">
                {kanban('columns.inProgress')}
              </DemoLabel>
            </>
          }
        >
          <KanbanDemo />
        </DemoFrame>
      </DemoItem>

      <DemoItem>
        <AiInsight description={t('aiInsight.description')} />
      </DemoItem>

      <DemoItem>
        <DemoCta accent="green">{t('cta')}</DemoCta>
      </DemoItem>
    </DemoPane>
  );
}

function BoardLegend() {
  const t = useTranslations('landing.demo.kanban.columns');

  const entries = [
    { key: 'todo', label: t('todo'), dot: 'bg-foreground/25' },
    { key: 'inProgress', label: t('inProgress'), dot: 'bg-dynamic-blue' },
    { key: 'done', label: t('done'), dot: 'bg-dynamic-green' },
  ];

  return (
    <div className="hidden items-center gap-3 sm:flex">
      {entries.map((entry) => (
        <span className="flex items-center gap-1.5" key={entry.key}>
          <span className={cn('h-1.5 w-1.5 rounded-full', entry.dot)} />
          <DemoLabel className="text-foreground/35">{entry.label}</DemoLabel>
        </span>
      ))}
    </div>
  );
}

/**
 * The assistant's read on the board. The meter fills once on entrance so the
 * card feels computed rather than printed.
 */
function AiInsight({ description }: { description: string }) {
  const t = useTranslations('landing.demo.taskManagement.aiInsight');
  const reduced = useReducedMotion();

  return (
    <div className="relative overflow-hidden rounded-xl border border-dynamic-green/20 bg-dynamic-green/[0.06] p-3.5">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-dynamic-green/50 to-transparent"
      />
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-dynamic-green/25 bg-dynamic-green/10">
          <Sparkles className="h-3 w-3 text-dynamic-green" />
        </span>
        <div className="min-w-0 flex-1">
          <DemoLabel className="text-dynamic-green">{t('title')}</DemoLabel>
          <p className="mt-2 text-[0.8rem] text-foreground/55 leading-relaxed">
            {description}
          </p>
          <div className="mt-3 h-px w-full overflow-hidden bg-foreground/[0.06]">
            <motion.div
              animate={{ scaleX: 1 }}
              className="h-full w-full origin-left bg-gradient-to-r from-dynamic-green/60 to-transparent"
              initial={{ scaleX: reduced ? 1 : 0 }}
              transition={{
                duration: reduced ? 0 : 1.1,
                ease: [0.16, 1, 0.3, 1],
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
