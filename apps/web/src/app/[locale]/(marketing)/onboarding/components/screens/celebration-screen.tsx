'use client';

import { ArrowRight, Check, PartyPopper } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { fireSchoolPride } from '@/lib/confetti';
import { OnboardingLayout } from '../shared/onboarding-card';

interface CelebrationScreenProps {
  onContinue: () => void;
  profileName?: string;
  workspaceName?: string;
  inviteCount?: number;
  hasPreferences?: boolean;
}

interface SummaryItem {
  label: string;
  show: boolean;
}

export function CelebrationScreen({
  onContinue,
  profileName,
  workspaceName,
  inviteCount = 0,
  hasPreferences = true,
}: CelebrationScreenProps) {
  const t = useTranslations('onboarding.celebration');

  // Fire confetti on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      fireSchoolPride();
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  const summaryItems: SummaryItem[] = [
    {
      label: t('summary.profile'),
      show: !!profileName,
    },
    {
      label: t('summary.workspace', { name: workspaceName || '' }),
      show: !!workspaceName,
    },
    {
      label: t('summary.invites', { count: inviteCount }),
      show: inviteCount > 0,
    },
    {
      label: t('summary.preferences'),
      show: hasPreferences,
    },
  ].filter((item) => item.show);

  return (
    <OnboardingLayout>
      <div className="w-full max-w-lg text-center">
        {/* Celebration icon */}
        <motion.div
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{
            type: 'spring',
            damping: 15,
            stiffness: 200,
            delay: 0.2,
          }}
          className="mx-auto mb-8 flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-dynamic-yellow/20 to-dynamic-orange/20"
        >
          <PartyPopper className="h-12 w-12 text-dynamic-orange" />
        </motion.div>

        {/* Title */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
          className="mb-3 font-bold text-4xl tracking-tight"
        >
          {t('title')}
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.5 }}
          className="mb-8 text-lg text-muted-foreground"
        >
          {t('subtitle')}
        </motion.p>

        {/* Summary card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.5 }}
          className="mb-8 rounded-2xl border bg-card p-6 text-left shadow-sm"
        >
          <h3 className="mb-4 font-semibold text-muted-foreground text-sm uppercase tracking-wide">
            {t('what-you-set-up')}
          </h3>
          <div className="space-y-3">
            {summaryItems.map((item, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.7 + index * 0.1, duration: 0.4 }}
                className="flex items-center gap-3"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-dynamic-green/10">
                  <Check className="h-4 w-4 text-dynamic-green" />
                </div>
                <span className="text-foreground">{item.label}</span>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* CTA Button */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1, duration: 0.5 }}
        >
          <Button onClick={onContinue} size="lg" className="gap-2">
            {t('go-to-dashboard')}
            <ArrowRight className="h-5 w-5" />
          </Button>
        </motion.div>

        {/* Optional tour link */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2, duration: 0.5 }}
          className="mt-4 text-muted-foreground text-sm"
        >
          {t('ready-to-explore')}
        </motion.p>
      </div>
    </OnboardingLayout>
  );
}
