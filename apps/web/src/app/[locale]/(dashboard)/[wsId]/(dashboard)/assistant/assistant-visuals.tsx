'use client';

import { cn } from '@tuturuuu/utils/format';
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from 'framer-motion';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import type { ConnectionStatus } from '@/hooks/use-live-api';

export function AuroraBlob({
  connected,
  isUserSpeaking,
  isSpeaking,
  volume,
}: {
  connected: boolean;
  isUserSpeaking: boolean;
  isSpeaking: boolean;
  volume: number;
}) {
  const shouldReduceMotion = useReducedMotion();
  const activity = useMotionValue(0);
  const activitySpring = useSpring(activity, {
    damping: 24,
    mass: 0.55,
    stiffness: 190,
  });
  const signalScale = useTransform(activitySpring, [0, 1], [0.94, 1.08]);
  const coreScale = useTransform(activitySpring, [0, 1], [0.86, 1.14]);
  const haloOpacity = useTransform(activitySpring, [0, 1], [0.18, 0.48]);

  useEffect(() => {
    if (!connected) activity.set(0);
    else if (isSpeaking) activity.set(Math.min(1, 0.48 + volume * 2.4));
    else if (isUserSpeaking) activity.set(0.72);
    else activity.set(0.18);
  }, [activity, connected, isSpeaking, isUserSpeaking, volume]);

  return (
    <motion.div
      aria-hidden
      className="pointer-events-none relative grid aspect-square w-[min(54vmin,400px)] place-items-center"
      style={{ scale: signalScale }}
    >
      <motion.div
        className="absolute inset-[3%] rounded-full border border-primary/10"
        animate={
          shouldReduceMotion
            ? undefined
            : { rotate: 360, scale: connected ? [0.98, 1.02, 0.98] : 0.96 }
        }
        transition={{
          rotate: { duration: 28, ease: 'linear', repeat: Infinity },
          scale: { duration: 5, ease: 'easeInOut', repeat: Infinity },
        }}
      >
        <span className="absolute top-[4%] left-[15%] size-2 rounded-full bg-primary/60 shadow-[0_0_24px_color-mix(in_oklab,var(--primary)_45%,transparent)]" />
      </motion.div>

      <motion.div
        className="absolute inset-[14%] rounded-full border border-primary/15 bg-primary/[0.025]"
        animate={
          shouldReduceMotion
            ? undefined
            : { rotate: -360, scale: connected ? [1.02, 0.98, 1.02] : 0.94 }
        }
        transition={{
          rotate: { duration: 22, ease: 'linear', repeat: Infinity },
          scale: { duration: 4.2, ease: 'easeInOut', repeat: Infinity },
        }}
      >
        <span className="absolute right-[4%] bottom-[9%] size-1.5 rounded-full bg-foreground/40" />
      </motion.div>

      <motion.div
        className={cn(
          'absolute inset-[24%] rounded-full border bg-background/55 shadow-2xl backdrop-blur-2xl',
          connected ? 'border-primary/25' : 'border-border/50'
        )}
        style={{
          boxShadow:
            '0 24px 80px -32px color-mix(in oklab, var(--primary) 45%, transparent)',
        }}
      >
        <motion.div
          className="absolute inset-[12%] rounded-full bg-primary/12 blur-2xl"
          style={{ opacity: haloOpacity, scale: coreScale }}
        />
        <motion.div
          className="absolute inset-[28%] rounded-full border border-primary/25 bg-primary/20"
          style={{ scale: coreScale }}
          animate={
            shouldReduceMotion || !connected
              ? undefined
              : { opacity: [0.55, 0.9, 0.55] }
          }
          transition={{ duration: 2.8, ease: 'easeInOut', repeat: Infinity }}
        />
        <div className="absolute inset-[39%] rounded-full bg-foreground/80 shadow-[0_0_36px_color-mix(in_oklab,var(--primary)_55%,transparent)]" />
      </motion.div>
    </motion.div>
  );
}

export function StatusPill({
  connected,
  connectionStatus,
  isUserSpeaking,
  isSpeaking,
}: {
  connected: boolean;
  connectionStatus: ConnectionStatus;
  isUserSpeaking: boolean;
  isSpeaking: boolean;
}) {
  const t = useTranslations('dashboard.voice_assistant');
  const isConnecting =
    connectionStatus === 'connecting' || connectionStatus === 'reconnecting';
  const status =
    connectionStatus === 'reconnecting'
      ? t('reconnecting')
      : connectionStatus === 'connecting'
        ? t('connecting')
        : !connected
          ? t('ready_to_connect')
          : isUserSpeaking
            ? t('listening')
            : isSpeaking
              ? t('speaking')
              : t('ready');

  return (
    <div
      aria-live="polite"
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 font-medium text-xs shadow-sm backdrop-blur-xl',
        connected
          ? 'border-primary/20 bg-background/65 text-foreground'
          : 'border-border/60 bg-background/50 text-muted-foreground'
      )}
    >
      <motion.span
        className={cn(
          'size-1.5 rounded-full',
          connected || isConnecting ? 'bg-primary' : 'bg-muted-foreground/45'
        )}
        animate={
          connected || isConnecting
            ? { opacity: [0.45, 1, 0.45], scale: [0.85, 1.2, 0.85] }
            : undefined
        }
        transition={{ duration: 1.6, ease: 'easeInOut', repeat: Infinity }}
      />
      {status}
    </div>
  );
}
