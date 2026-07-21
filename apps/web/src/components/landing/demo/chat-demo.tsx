'use client';

import {
  Bot,
  Calendar,
  CalendarSearch,
  Check,
  CheckCircle2,
  Clock,
  Send,
  Sparkles,
  User,
} from '@tuturuuu/icons/lucide';
import { cn } from '@tuturuuu/utils/format';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import {
  DemoCta,
  DemoFrame,
  DemoHeading,
  DemoItem,
  DemoLabel,
  DemoPane,
  DemoPulse,
} from './demo-chrome';
import { useConversation, useTypewriter } from './use-conversation';

/**
 * Beat durations in ms, one per revealed element. The conversation loops so the
 * panel is always mid-exchange when a reader scrolls to it.
 */
const BEATS = [900, 1100, 2600, 1400, 1200, 1500, 2400] as const;

const STEP = {
  userAsks: 1,
  assistantThinking: 2,
  assistantAnswers: 3,
  userFollowsUp: 4,
  toolRunning: 5,
  toolDone: 6,
  assistantConfirms: 7,
} as const;

function Bubble({
  from,
  children,
}: {
  from: 'user' | 'assistant';
  children: ReactNode;
}) {
  const isUser = from === 'user';

  return (
    <motion.div
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className={cn(
        'flex items-end gap-2',
        isUser ? 'justify-end' : 'justify-start'
      )}
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
    >
      {isUser ? null : <Avatar />}
      <div
        className={cn(
          'max-w-[78%] rounded-2xl border px-3 py-2',
          isUser
            ? 'rounded-br-sm border-dynamic-blue/20 bg-dynamic-blue/10'
            : 'rounded-bl-sm border-foreground/[0.08] bg-foreground/[0.025]'
        )}
      >
        {children}
      </div>
      {isUser ? (
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-dynamic-blue/25 bg-dynamic-blue/10">
          <User className="h-3 w-3 text-dynamic-blue" />
        </span>
      ) : null}
    </motion.div>
  );
}

function Avatar({ active = false }: { active?: boolean }) {
  return (
    <span className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-dynamic-purple/25 bg-dynamic-purple/10">
      {active ? (
        <span
          aria-hidden
          className="absolute inset-0 animate-ring-pulse rounded-full bg-dynamic-purple/40"
        />
      ) : null}
      <Bot className="relative h-3 w-3 text-dynamic-purple" />
    </span>
  );
}

/** Three dots breathing in sequence while the assistant composes a reply. */
function TypingIndicator() {
  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="flex items-end gap-2"
      exit={{ opacity: 0 }}
      initial={{ opacity: 0 }}
    >
      <Avatar active />
      <div className="rounded-2xl rounded-bl-sm border border-foreground/[0.08] bg-foreground/[0.025] px-3.5 py-2.5">
        <div aria-hidden className="flex items-center gap-1">
          {[0, 1, 2].map((dot) => (
            <motion.span
              animate={{ opacity: [0.25, 1, 0.25], y: [0, -2, 0] }}
              className="h-1.5 w-1.5 rounded-full bg-dynamic-purple"
              key={dot}
              transition={{
                duration: 1.2,
                repeat: Number.POSITIVE_INFINITY,
                delay: dot * 0.16,
                ease: 'easeInOut',
              }}
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
}

/**
 * The assistant reaching for a tool. Makes the "act" half of the product story
 * visible instead of implying it in prose.
 */
function ToolCall({ label, done }: { label: string; done: boolean }) {
  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className="ml-8 flex items-center gap-2 rounded-lg border border-dynamic-cyan/20 bg-dynamic-cyan/[0.06] px-2.5 py-1.5"
      initial={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
    >
      {done ? (
        <Check className="h-3 w-3 shrink-0 text-dynamic-cyan" />
      ) : (
        <CalendarSearch className="h-3 w-3 shrink-0 animate-pulse text-dynamic-cyan motion-reduce:animate-none" />
      )}
      <DemoLabel className="text-dynamic-cyan">{label}</DemoLabel>
    </motion.div>
  );
}

export function ChatDemo() {
  const t = useTranslations('landing.demo.aiChat');
  const tabs = useTranslations('landing.demo.tabs');
  const { step, reduced } = useConversation(BEATS);

  const agenda = [
    t('aiResponse1.item1'),
    t('aiResponse1.item2'),
    t('aiResponse1.item3'),
  ];

  const intro = t('aiResponse1.intro');
  const confirm = t('aiResponse2');

  const introType = useTypewriter(
    intro,
    step >= STEP.assistantAnswers,
    reduced
  );
  const confirmType = useTypewriter(
    confirm,
    step >= STEP.assistantConfirms,
    reduced
  );

  const quickActions = [
    {
      id: 'tasks',
      icon: Calendar,
      label: t('quickActions.tasks'),
      tone: 'border-dynamic-blue/25 text-dynamic-blue hover:bg-dynamic-blue/10',
    },
    {
      id: 'reminder',
      icon: Clock,
      label: t('quickActions.reminder'),
      tone: 'border-dynamic-green/25 text-dynamic-green hover:bg-dynamic-green/10',
    },
    {
      id: 'summary',
      icon: Sparkles,
      label: t('quickActions.summary'),
      tone: 'border-dynamic-purple/25 text-dynamic-purple hover:bg-dynamic-purple/10',
    },
  ];

  return (
    <DemoPane>
      <DemoItem>
        <DemoHeading
          accent="purple"
          aside={
            <div className="flex items-center gap-2 rounded-full border border-dynamic-green/20 bg-dynamic-green/[0.06] px-2.5 py-1">
              <DemoPulse accent="green" />
              <DemoLabel className="text-dynamic-green">
                {t('status')}
              </DemoLabel>
            </div>
          }
          kicker={t('subtitle')}
          title={t('title')}
        />
      </DemoItem>

      <DemoItem>
        <DemoFrame
          accent="purple"
          icon={Bot}
          label={tabs('chat')}
          meta={<DemoPulse accent="purple" />}
        >
          {/* Fixed height keeps the frame from jumping as beats arrive */}
          <div className="flex h-[264px] flex-col justify-end space-y-2.5 overflow-hidden p-3">
            <AnimatePresence initial={false} mode="popLayout">
              {step >= STEP.userAsks ? (
                <Bubble from="user" key="q1">
                  <p className="text-[0.82rem] text-foreground/80">
                    {t('userMessage1')}
                  </p>
                </Bubble>
              ) : null}

              {step === STEP.assistantThinking ? (
                <TypingIndicator key="typing-1" />
              ) : null}

              {step >= STEP.assistantAnswers ? (
                <Bubble from="assistant" key="a1">
                  <p className="text-[0.82rem] text-foreground/75">
                    {introType.shown}
                    {introType.done ? null : <Caret />}
                  </p>
                  {introType.done ? (
                    <ul className="mt-2 space-y-1.5">
                      {agenda.map((item, index) => (
                        <motion.li
                          animate={{ opacity: 1, x: 0 }}
                          className="flex items-start gap-2"
                          initial={{ opacity: 0, x: -6 }}
                          key={item}
                          transition={{ delay: index * 0.12, duration: 0.3 }}
                        >
                          <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-dynamic-green" />
                          <span className="font-mono-ui text-[0.7rem] text-foreground/60 tabular-nums">
                            {item}
                          </span>
                        </motion.li>
                      ))}
                    </ul>
                  ) : null}
                </Bubble>
              ) : null}

              {step >= STEP.userFollowsUp ? (
                <Bubble from="user" key="q2">
                  <p className="text-[0.82rem] text-foreground/80">
                    {t('userMessage2')}
                  </p>
                </Bubble>
              ) : null}

              {step >= STEP.toolRunning ? (
                <ToolCall
                  done={step >= STEP.toolDone}
                  key="tool"
                  label={
                    step >= STEP.toolDone
                      ? t('toolCall.done')
                      : t('toolCall.checking')
                  }
                />
              ) : null}

              {step >= STEP.assistantConfirms ? (
                <Bubble from="assistant" key="a2">
                  <p className="text-[0.82rem] text-foreground/75">
                    {confirmType.shown}
                    {confirmType.done ? null : <Caret />}
                  </p>
                </Bubble>
              ) : null}
            </AnimatePresence>
          </div>

          <div className="border-foreground/[0.06] border-t p-2.5">
            <div className="flex items-center gap-2">
              <div className="flex flex-1 items-center gap-1.5 rounded-lg border border-foreground/[0.08] bg-foreground/[0.02] px-3 py-2">
                <span className="text-[0.78rem] text-foreground/30">
                  {t('inputPlaceholder')}
                </span>
                <span
                  aria-hidden
                  className="h-3.5 w-px animate-pulse bg-dynamic-purple motion-reduce:animate-none"
                />
              </div>
              <span
                aria-hidden
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-dynamic-purple/25 bg-dynamic-purple/10"
              >
                <Send className="h-3.5 w-3.5 text-dynamic-purple" />
              </span>
            </div>
          </div>
        </DemoFrame>
      </DemoItem>

      <DemoItem className="flex flex-wrap gap-2">
        {quickActions.map((action) => (
          <span
            className={cn(
              'flex cursor-default items-center gap-1.5 rounded-full border bg-foreground/[0.015] px-2.5 py-1 transition-colors duration-300',
              action.tone
            )}
            key={action.id}
          >
            <action.icon className="h-2.5 w-2.5" />
            <DemoLabel>{action.label}</DemoLabel>
          </span>
        ))}
      </DemoItem>

      <DemoItem>
        <div className="relative overflow-hidden rounded-xl border border-dynamic-purple/20 bg-dynamic-purple/[0.06] p-3.5">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-dynamic-purple/50 to-transparent"
          />
          <DemoLabel className="text-dynamic-purple">
            {t('contextAware.title')}
          </DemoLabel>
          <p className="mt-2 text-[0.8rem] text-foreground/55 leading-relaxed">
            {t('contextAware.description')}
          </p>
        </div>
      </DemoItem>

      <DemoItem>
        <DemoCta accent="purple">{t('cta')}</DemoCta>
      </DemoItem>
    </DemoPane>
  );
}

/** Streaming cursor shown while the assistant is still writing. */
function Caret() {
  return (
    <span
      aria-hidden
      className="ml-0.5 inline-block h-3 w-px translate-y-0.5 animate-pulse bg-dynamic-purple align-baseline motion-reduce:animate-none"
    />
  );
}
