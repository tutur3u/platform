'use client';

import { Mail, Plus, UserPlus, X } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { cn } from '@tuturuuu/utils/format';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { z } from 'zod';
import { NavigationButtons } from '../shared/navigation-buttons';
import {
  OnboardingCard,
  OnboardingHeader,
  OnboardingLayout,
} from '../shared/onboarding-card';

const emailSchema = z.email();

interface TeamInviteScreenProps {
  onContinue: (emails: string[]) => void;
  onBack: () => void;
  onSkip: () => void;
  initialEmails?: string[];
  loading?: boolean;
}

export function TeamInviteScreen({
  onContinue,
  onBack,
  onSkip,
  initialEmails = [],
  loading = false,
}: TeamInviteScreenProps) {
  const t = useTranslations('onboarding.team-invite');
  const [emails, setEmails] = useState<string[]>(initialEmails);
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const addEmail = () => {
    const trimmed = inputValue.trim().toLowerCase();
    if (!trimmed) return;

    // Validate email
    const result = emailSchema.safeParse(trimmed);
    if (!result.success) {
      setError(t('invalid-email'));
      return;
    }

    // Check for duplicates
    if (emails.includes(trimmed)) {
      setError(t('duplicate-email'));
      return;
    }

    setEmails([...emails, trimmed]);
    setInputValue('');
    setError(null);
  };

  const removeEmail = (email: string) => {
    setEmails(emails.filter((e) => e !== email));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addEmail();
    }
  };

  const handleContinue = () => {
    onContinue(emails);
  };

  return (
    <OnboardingLayout>
      <OnboardingCard direction="forward">
        <OnboardingHeader
          icon={<UserPlus className="h-8 w-8 text-primary" />}
          title={t('title')}
          subtitle={t('subtitle')}
        />

        <div className="space-y-6">
          {/* Email input */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.4 }}
          >
            <label className="mb-2 block font-medium text-base">
              {t('email-label')}
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Mail className="absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="email"
                  value={inputValue}
                  onChange={(e) => {
                    setInputValue(e.target.value);
                    setError(null);
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder={t('email-placeholder')}
                  disabled={loading}
                  className={cn(
                    'h-12 pl-10 text-base',
                    error && 'border-destructive'
                  )}
                />
              </div>
              <Button
                type="button"
                onClick={addEmail}
                disabled={loading || !inputValue.trim()}
                variant="outline"
                className="h-12 px-4"
              >
                <Plus className="h-5 w-5" />
              </Button>
            </div>
            {error && (
              <motion.p
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-2 text-destructive text-sm"
              >
                {error}
              </motion.p>
            )}
          </motion.div>

          {/* Email chips */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.4 }}
            className="min-h-20"
          >
            {emails.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                <AnimatePresence mode="popLayout">
                  {emails.map((email) => (
                    <motion.div
                      key={email}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      transition={{
                        type: 'spring',
                        damping: 20,
                        stiffness: 300,
                      }}
                    >
                      <Badge
                        variant="secondary"
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm"
                      >
                        <Mail className="h-3.5 w-3.5" />
                        {email}
                        <button
                          type="button"
                          onClick={() => removeEmail(email)}
                          disabled={loading}
                          className="ml-1 rounded-full p-0.5 hover:bg-background/50"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </Badge>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            ) : (
              <div className="flex h-20 items-center justify-center rounded-xl border-2 border-dashed text-muted-foreground">
                <p className="text-sm">{t('no-emails-yet')}</p>
              </div>
            )}
          </motion.div>

          {/* Summary */}
          {emails.length > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="rounded-xl bg-dynamic-green/5 p-4"
            >
              <p className="text-dynamic-green text-sm">
                {t('invite-count', { count: emails.length })}
              </p>
            </motion.div>
          )}
        </div>

        <NavigationButtons
          onBack={onBack}
          onContinue={handleContinue}
          onSkip={onSkip}
          backLabel={t('back')}
          continueLabel={emails.length > 0 ? t('send-invites') : t('continue')}
          skipLabel={t('skip')}
          showBack={true}
          showSkip={true}
          loading={loading}
        />
      </OnboardingCard>
    </OnboardingLayout>
  );
}
