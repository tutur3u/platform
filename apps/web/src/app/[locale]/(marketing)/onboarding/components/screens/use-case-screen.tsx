'use client';

import { Building2, Compass, User, Users } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { UseCase } from '../../types';
import { USE_CASE_OPTIONS } from '../../types';
import { NavigationButtons } from '../shared/navigation-buttons';
import {
  OnboardingCard,
  OnboardingHeader,
  OnboardingLayout,
} from '../shared/onboarding-card';

interface UseCaseScreenProps {
  onContinue: (useCase: UseCase) => void;
  onBack: () => void;
  initialValue?: UseCase | null;
  loading?: boolean;
}

interface UseCaseOption {
  id: UseCase;
  icon: typeof User;
  colorClass: string;
  bgClass: string;
}

const useCaseOptions: UseCaseOption[] = [
  {
    id: USE_CASE_OPTIONS.PERSONAL,
    icon: User,
    colorClass: 'text-dynamic-blue',
    bgClass: 'bg-dynamic-blue/10 group-hover:bg-dynamic-blue/20',
  },
  {
    id: USE_CASE_OPTIONS.SMALL_TEAM,
    icon: Users,
    colorClass: 'text-dynamic-green',
    bgClass: 'bg-dynamic-green/10 group-hover:bg-dynamic-green/20',
  },
  {
    id: USE_CASE_OPTIONS.LARGE_TEAM,
    icon: Building2,
    colorClass: 'text-dynamic-purple',
    bgClass: 'bg-dynamic-purple/10 group-hover:bg-dynamic-purple/20',
  },
  {
    id: USE_CASE_OPTIONS.EXPLORING,
    icon: Compass,
    colorClass: 'text-dynamic-orange',
    bgClass: 'bg-dynamic-orange/10 group-hover:bg-dynamic-orange/20',
  },
];

export function UseCaseScreen({
  onContinue,
  onBack,
  initialValue,
  loading = false,
}: UseCaseScreenProps) {
  const t = useTranslations('onboarding.use-case');
  const [selected, setSelected] = useState<UseCase | null>(
    initialValue ?? null
  );

  const handleContinue = () => {
    if (selected) {
      onContinue(selected);
    }
  };

  return (
    <OnboardingLayout>
      <OnboardingCard direction="forward" className="max-w-3xl">
        <OnboardingHeader
          icon={<Compass className="h-8 w-8 text-primary" />}
          title={t('title')}
          subtitle={t('subtitle')}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          {useCaseOptions.map((option, index) => {
            const Icon = option.icon;
            const isSelected = selected === option.id;

            return (
              <motion.button
                key={option.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + index * 0.1, duration: 0.4 }}
                onClick={() => setSelected(option.id)}
                disabled={loading}
                className={cn(
                  'group relative flex flex-col items-start rounded-xl border-2 p-5 text-left transition-all duration-200',
                  'hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/50',
                  isSelected
                    ? 'border-primary bg-primary/5 shadow-md'
                    : 'border-border hover:border-primary/50'
                )}
              >
                {/* Selected indicator */}
                {isSelected && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute top-3 right-3 h-3 w-3 rounded-full bg-primary"
                  />
                )}

                {/* Icon */}
                <div
                  className={cn(
                    'mb-4 flex h-12 w-12 items-center justify-center rounded-xl transition-colors',
                    option.bgClass
                  )}
                >
                  <Icon className={cn('h-6 w-6', option.colorClass)} />
                </div>

                {/* Title */}
                <h3 className="mb-1 font-semibold text-lg">
                  {t(`${option.id}.title`)}
                </h3>

                {/* Description */}
                <p className="text-muted-foreground text-sm">
                  {t(`${option.id}.description`)}
                </p>

                {/* Team badge for team options */}
                {(option.id === USE_CASE_OPTIONS.SMALL_TEAM ||
                  option.id === USE_CASE_OPTIONS.LARGE_TEAM) && (
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                    className="mt-3 inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 font-medium text-primary text-xs"
                  >
                    {t('team-badge')}
                  </motion.span>
                )}
              </motion.button>
            );
          })}
        </div>

        <NavigationButtons
          onBack={onBack}
          onContinue={handleContinue}
          backLabel={t('back')}
          continueLabel={t('continue')}
          showBack={true}
          loading={loading}
          disabled={!selected}
        />
      </OnboardingCard>
    </OnboardingLayout>
  );
}
