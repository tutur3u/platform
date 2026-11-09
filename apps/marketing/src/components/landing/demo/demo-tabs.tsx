'use client';

import {
  BarChart3,
  Bot,
  Calendar,
  CheckCircle2,
  ClipboardList,
  type LucideIcon,
  Video,
  Wallet,
} from '@tuturuuu/icons/lucide';
import { cn } from '@tuturuuu/utils/format';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { AnalyticsDemo } from './analytics-demo';
import { CalendarDemo } from './calendar-demo';
import { ChatDemo } from './chat-demo';
import { type DemoAccent, DemoLabel, demoAccents } from './demo-chrome';
import { FinanceDemo } from './finance-demo';
import { FormsDemo } from './forms-demo';
import { MeetingDemo } from './meeting-demo';
import { TasksDemo } from './tasks-demo';

type TabId =
  | 'tasks'
  | 'calendar'
  | 'meeting'
  | 'chat'
  | 'analytics'
  | 'finance'
  | 'forms';

interface DemoApp {
  id: TabId;
  icon: LucideIcon;
  accent: DemoAccent;
  /** Path segment shown in the window's location bar. */
  slug: string;
}

const apps: DemoApp[] = [
  { id: 'tasks', icon: CheckCircle2, accent: 'green', slug: 'tasks' },
  { id: 'calendar', icon: Calendar, accent: 'blue', slug: 'calendar' },
  { id: 'meeting', icon: Video, accent: 'orange', slug: 'meet' },
  { id: 'chat', icon: Bot, accent: 'purple', slug: 'mira' },
  { id: 'analytics', icon: BarChart3, accent: 'cyan', slug: 'insights' },
  { id: 'finance', icon: Wallet, accent: 'purple', slug: 'finance' },
  { id: 'forms', icon: ClipboardList, accent: 'green', slug: 'forms' },
];

const panels: Record<TabId, () => React.JSX.Element> = {
  tasks: TasksDemo,
  calendar: CalendarDemo,
  meeting: MeetingDemo,
  chat: ChatDemo,
  analytics: AnalyticsDemo,
  finance: FinanceDemo,
  forms: FormsDemo,
};

/**
 * Rail labels. The five original rooms have their own `landing.demo.tabs`
 * entries; finance and forms reuse the product names the marketing navigation
 * already ships in every locale.
 */
function useRoomLabels(): Record<TabId, string> {
  const tabs = useTranslations('landing.demo.tabs');
  const products = useTranslations('marketing-nav.products');

  return {
    tasks: tabs('tasks'),
    calendar: tabs('calendar'),
    meeting: tabs('meeting'),
    chat: tabs('chat'),
    analytics: tabs('analytics'),
    finance: products('finance.label'),
    forms: products('forms.label'),
  };
}

/**
 * The interactive product demo, presented as one workspace rather than five
 * unrelated mockups.
 *
 * Everything lives inside a single application window: the app rail on the left
 * switches rooms, the location bar tracks where you are, and only the content
 * area changes. That reads as a real product you could open, which a row of
 * tabs above a card never did.
 */
export function DemoTabs() {
  const [activeId, setActiveId] = useState<TabId>('tasks');
  const t = useTranslations('landing.demo');
  const labels = useRoomLabels();
  const reduced = useReducedMotion();

  const active = apps.find((app) => app.id === activeId) ?? apps[0];
  const ActivePanel = panels[activeId];
  const styles = demoAccents[active?.accent ?? 'green'];

  return (
    <div className="relative overflow-hidden rounded-[1.15rem] border border-foreground/[0.07] bg-background/40 backdrop-blur-sm">
      {/* Window bar */}
      <div className="flex items-center gap-3 border-foreground/[0.06] border-b bg-foreground/[0.025] px-3 py-2.5 sm:px-4">
        <div aria-hidden className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-dynamic-red/40" />
          <span className="h-2.5 w-2.5 rounded-full bg-dynamic-yellow/40" />
          <span className="h-2.5 w-2.5 rounded-full bg-dynamic-green/40" />
        </div>

        {/* Location bar — tracks the selected room */}
        <div className="mx-auto flex min-w-0 max-w-full items-center gap-1.5 rounded-md border border-foreground/[0.07] bg-background/60 px-2.5 py-1">
          <span className="truncate font-mono-ui text-[0.6rem] text-foreground/30 tracking-[0.1em]">
            tuturuuu.com
          </span>
          <span aria-hidden className="text-foreground/20">
            /
          </span>
          <AnimatePresence initial={false} mode="wait">
            <motion.span
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                'font-mono-ui text-[0.6rem] tracking-[0.1em]',
                styles.text
              )}
              exit={reduced ? undefined : { opacity: 0, y: -4 }}
              initial={reduced ? false : { opacity: 0, y: 4 }}
              key={active?.slug}
              transition={{ duration: 0.2 }}
            >
              {active?.slug}
            </motion.span>
          </AnimatePresence>
        </div>

        {/* Keyboard affordance — the kind of detail a real shell carries */}
        <div className="hidden items-center gap-1.5 sm:flex">
          <kbd className="rounded border border-foreground/10 bg-foreground/[0.04] px-1.5 py-0.5 font-mono-ui text-[0.58rem] text-foreground/40">
            ⌘K
          </kbd>
          <DemoLabel className="text-foreground/30">
            {t('shell.search')}
          </DemoLabel>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row">
        {/* App rail. Vertical on desktop, a scrolling strip on small screens. */}
        <div
          aria-label={t('badge')}
          className={cn(
            'flex shrink-0 gap-1 overflow-x-auto border-foreground/[0.06] p-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
            'border-b lg:w-[9.5rem] lg:flex-col lg:overflow-visible lg:border-r lg:border-b-0'
          )}
          role="tablist"
        >
          {/* Workspace chip — anchors the rail the way a real sidebar does */}
          <div className="mb-1 hidden items-center gap-2 rounded-lg border border-foreground/[0.07] bg-foreground/[0.02] px-2 py-1.5 lg:flex">
            <span
              aria-hidden
              className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-[linear-gradient(135deg,var(--purple),var(--blue))] font-mono-ui text-[0.5rem] text-white"
            >
              T
            </span>
            <DemoLabel className="truncate text-foreground/45">
              Tuturuuu
            </DemoLabel>
          </div>

          {apps.map((app, index) => (
            <AppRailItem
              app={app}
              index={index}
              isActive={activeId === app.id}
              key={app.id}
              label={labels[app.id]}
              onSelect={() => setActiveId(app.id)}
              reduced={Boolean(reduced)}
            />
          ))}

          {/* Presence footer */}
          <div className="mt-auto hidden items-center gap-2 border-foreground/[0.06] border-t px-2 pt-3 lg:flex">
            <span className="flex -space-x-1.5">
              {['bg-dynamic-purple/40', 'bg-dynamic-blue/40'].map((tone) => (
                <span
                  aria-hidden
                  className={cn(
                    'h-4 w-4 rounded-full border border-background',
                    tone
                  )}
                  key={tone}
                />
              ))}
            </span>
            <span className="h-1.5 w-1.5 rounded-full bg-dynamic-green" />
          </div>
        </div>

        {/* Content area */}
        <div className="relative min-w-0 flex-1 p-3 sm:p-5">
          <AnimatePresence initial={false} mode="wait">
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              aria-labelledby={`demo-tab-${activeId}`}
              exit={reduced ? undefined : { opacity: 0, y: -8 }}
              id={`demo-panel-${activeId}`}
              initial={reduced ? false : { opacity: 0, y: 10 }}
              key={activeId}
              role="tabpanel"
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            >
              <ActivePanel />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Status bar. Also where the illustration says plainly what it is. */}
      <div className="flex items-center gap-3 border-foreground/[0.06] border-t bg-foreground/[0.02] px-3 py-2 sm:px-4">
        <DemoLabel className="truncate text-foreground/30">
          {t('shell.illustration')}
        </DemoLabel>
        <div className="ml-auto flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-dynamic-green/70" />
          <DemoLabel className="text-foreground/30">
            {t('shell.synced')}
          </DemoLabel>
        </div>
      </div>
    </div>
  );
}

function AppRailItem({
  app,
  index,
  label,
  isActive,
  reduced,
  onSelect,
}: {
  app: DemoApp;
  index: number;
  label: string;
  isActive: boolean;
  reduced: boolean;
  onSelect: () => void;
}) {
  const styles = demoAccents[app.accent];
  const Icon = app.icon;

  return (
    <button
      aria-controls={`demo-panel-${app.id}`}
      aria-selected={isActive}
      className={cn(
        'group relative shrink-0 rounded-lg px-2.5 py-2 text-left transition-colors duration-300 lg:w-full',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-0',
        styles.ring
      )}
      id={`demo-tab-${app.id}`}
      onClick={onSelect}
      role="tab"
      type="button"
    >
      {isActive ? (
        reduced ? (
          <span
            aria-hidden
            className="absolute inset-0 rounded-lg bg-foreground/[0.06]"
          />
        ) : (
          <motion.span
            aria-hidden
            className="absolute inset-0 rounded-lg bg-foreground/[0.06]"
            layoutId="demo-rail-surface"
            transition={{ type: 'spring', stiffness: 420, damping: 36 }}
          />
        )
      ) : null}

      {/* Accent marker: a left bar on the vertical rail, an underline when the
          rail collapses to a horizontal strip. */}
      {isActive ? (
        <span
          aria-hidden
          className={cn(
            'absolute rounded-full',
            styles.fill,
            'inset-x-2.5 bottom-0 h-0.5 lg:inset-x-auto lg:top-1.5 lg:bottom-1.5 lg:left-0 lg:h-auto lg:w-0.5'
          )}
        />
      ) : null}

      <span className="relative flex items-center gap-2">
        <Icon
          className={cn(
            'h-3.5 w-3.5 shrink-0 transition-colors duration-300',
            isActive
              ? styles.text
              : 'text-foreground/35 group-hover:text-foreground/60'
          )}
        />
        <DemoLabel
          className={cn(
            'truncate transition-colors duration-300',
            isActive
              ? 'text-foreground/85'
              : 'text-foreground/40 group-hover:text-foreground/65'
          )}
        >
          {label}
        </DemoLabel>
        <span
          className={cn(
            'ml-auto hidden font-mono-ui text-[0.55rem] tabular-nums transition-colors duration-300 lg:inline',
            isActive ? styles.text : 'text-foreground/20'
          )}
        >
          {`0${index + 1}`}
        </span>
      </span>
    </button>
  );
}
