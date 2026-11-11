'use client';

import {
  CheckCircle2,
  FileText,
  ListChecks,
  Sparkles,
  TrendingUp,
  Users,
  Video,
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

const tileTones: Record<DemoAccent, string> = {
  green: 'bg-dynamic-green/15 text-dynamic-green',
  blue: 'bg-dynamic-blue/15 text-dynamic-blue',
  orange: 'bg-dynamic-orange/15 text-dynamic-orange',
  purple: 'bg-dynamic-purple/15 text-dynamic-purple',
  cyan: 'bg-dynamic-cyan/15 text-dynamic-cyan',
};

/** Five bars breathing at different rates — reads as live audio, not a GIF. */
function Waveform() {
  const reduced = useReducedMotion();
  const bars = [0.35, 0.8, 0.5, 1, 0.45];

  return (
    <div aria-hidden className="flex items-end gap-0.5">
      {bars.map((peak, index) => (
        <motion.span
          animate={reduced ? { height: 4 } : { height: [3, 3 + peak * 9, 3] }}
          className="w-0.5 rounded-full bg-dynamic-green"
          key={`bar-${index}`}
          transition={{
            duration: 0.9 + index * 0.12,
            repeat: reduced ? 0 : Number.POSITIVE_INFINITY,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  );
}

function ParticipantTile({
  name,
  accent,
  speaking,
  isAssistant,
}: {
  name: string;
  accent: DemoAccent;
  speaking?: boolean;
  isAssistant?: boolean;
}) {
  const styles = demoAccents[accent];

  return (
    <div
      className={cn(
        'relative flex aspect-[4/3] flex-col items-center justify-center gap-1.5 rounded-lg border bg-foreground/[0.02] transition-colors duration-300 sm:aspect-video',
        speaking ? styles.border : 'border-foreground/[0.06]'
      )}
    >
      <span
        className={cn(
          'flex h-8 w-8 items-center justify-center rounded-full font-mono-ui text-[0.7rem]',
          tileTones[accent]
        )}
      >
        {isAssistant ? (
          <Sparkles className="h-3.5 w-3.5" />
        ) : (
          name.trim().charAt(0)
        )}
      </span>
      <DemoLabel className="max-w-full truncate px-1 text-foreground/45">
        {name}
      </DemoLabel>
      {speaking ? (
        <div className="absolute bottom-1.5 left-1.5">
          <Waveform />
        </div>
      ) : null}
    </div>
  );
}

function Transcript() {
  const t = useTranslations('landing.demo.videoMeeting');
  const reduced = useReducedMotion();

  const lines: { id: string; speaker: string; text: string; tone: string }[] = [
    {
      id: 'sarah',
      speaker: t('participants.sarah'),
      text: t('transcript.sarah'),
      tone: 'text-dynamic-purple',
    },
    {
      id: 'alex',
      speaker: t('participants.alex'),
      text: t('transcript.alex'),
      tone: 'text-dynamic-green',
    },
    {
      id: 'mira',
      speaker: t('participants.mira'),
      text: t('transcript.mira'),
      tone: 'text-dynamic-orange',
    },
  ];

  return (
    <div className="border-foreground/[0.06] border-t p-3">
      <DemoLabel className="text-foreground/30">
        {t('transcript.title')}
      </DemoLabel>
      <div className="mt-2.5 space-y-2">
        {lines.map((line, index) => (
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col gap-0.5 sm:flex-row sm:gap-2.5"
            initial={{ opacity: 0, y: reduced ? 0 : 4 }}
            key={line.id}
            transition={{
              duration: reduced ? 0.15 : 0.4,
              delay: reduced ? 0 : 0.2 + index * 0.12,
            }}
          >
            <DemoLabel className={cn('shrink-0 sm:w-24', line.tone)}>
              {line.speaker}
            </DemoLabel>
            <p className="text-[0.78rem] text-foreground/55 leading-relaxed">
              {line.text}
              {index === lines.length - 1 ? (
                <span className="ml-1 inline-block h-3 w-px translate-y-0.5 animate-pulse bg-dynamic-orange motion-reduce:animate-none" />
              ) : null}
            </p>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

export function MeetingDemo() {
  const t = useTranslations('landing.demo.videoMeeting');

  const participants: {
    id: string;
    name: string;
    accent: DemoAccent;
    speaking?: boolean;
    isAssistant?: boolean;
  }[] = [
    { id: 'you', name: t('participants.you'), accent: 'blue', speaking: true },
    { id: 'sarah', name: t('participants.sarah'), accent: 'purple' },
    { id: 'alex', name: t('participants.alex'), accent: 'green' },
    {
      id: 'mira',
      name: t('participants.mira'),
      accent: 'orange',
      isAssistant: true,
    },
  ];

  const features = [
    {
      id: 'liveNotes',
      icon: FileText,
      title: t('aiFeatures.liveNotes.title'),
      description: t('aiFeatures.liveNotes.description'),
      tone: 'text-dynamic-blue',
    },
    {
      id: 'actionItems',
      icon: ListChecks,
      title: t('aiFeatures.actionItems.title'),
      description: t('aiFeatures.actionItems.description'),
      tone: 'text-dynamic-green',
    },
    {
      id: 'summary',
      icon: Sparkles,
      title: t('aiFeatures.summary.title'),
      description: t('aiFeatures.summary.description'),
      tone: 'text-dynamic-purple',
    },
  ];

  const insights = [
    {
      id: 'topics',
      icon: Sparkles,
      label: t('insights.topics'),
      tone: 'border-dynamic-orange/25 text-dynamic-orange',
    },
    {
      id: 'actionItems',
      icon: CheckCircle2,
      label: t('insights.actionItems'),
      tone: 'border-dynamic-green/25 text-dynamic-green',
    },
    {
      id: 'sentiment',
      icon: TrendingUp,
      label: t('insights.sentiment'),
      tone: 'border-dynamic-blue/25 text-dynamic-blue',
    },
  ];

  return (
    <DemoPane>
      <DemoItem>
        <DemoHeading
          accent="orange"
          aside={
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-dynamic-red motion-reduce:animate-none" />
              <DemoLabel className="text-dynamic-red">
                {t('header.recording')}
              </DemoLabel>
            </div>
          }
          kicker={t('subtitle')}
          title={t('title')}
        />
      </DemoItem>

      <DemoItem>
        <DemoFrame
          accent="orange"
          icon={Video}
          label={t('header.title')}
          meta={
            <>
              <span className="font-mono-ui text-[0.62rem] tabular-nums">
                {t('duration')}
              </span>
              <span className="hidden items-center gap-1 sm:flex">
                <Users className="h-2.5 w-2.5" />
                <DemoLabel>{t('header.participants')}</DemoLabel>
              </span>
            </>
          }
        >
          <div className="grid grid-cols-2 gap-2 p-2.5 sm:grid-cols-4">
            {participants.map((participant) => (
              <ParticipantTile
                accent={participant.accent}
                isAssistant={participant.isAssistant}
                key={participant.id}
                name={participant.name}
                speaking={participant.speaking}
              />
            ))}
          </div>
          <Transcript />
        </DemoFrame>
      </DemoItem>

      <DemoItem className="grid gap-2 sm:grid-cols-3">
        {features.map((feature) => (
          <div
            className="rounded-xl border border-foreground/[0.08] bg-foreground/[0.015] p-3 transition-colors duration-300 hover:bg-foreground/[0.03]"
            key={feature.id}
          >
            <feature.icon className={cn('h-3.5 w-3.5', feature.tone)} />
            <div className="mt-2.5 font-medium text-[0.8rem] text-foreground/80">
              {feature.title}
            </div>
            <p className="mt-1 text-[0.7rem] text-foreground/45 leading-relaxed">
              {feature.description}
            </p>
          </div>
        ))}
      </DemoItem>

      <DemoItem className="flex flex-wrap gap-2">
        {insights.map((insight) => (
          <span
            className={cn(
              'flex items-center gap-1.5 rounded-full border bg-foreground/[0.015] px-2.5 py-1',
              insight.tone
            )}
            key={insight.id}
          >
            <insight.icon className="h-2.5 w-2.5" />
            <DemoLabel>{insight.label}</DemoLabel>
          </span>
        ))}
      </DemoItem>

      <DemoItem>
        <DemoCta accent="orange">{t('cta')}</DemoCta>
      </DemoItem>
    </DemoPane>
  );
}
