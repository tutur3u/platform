'use client';

import { ArrowRight, Loader2 } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';

interface WelcomeScreenProps {
  onGetStarted: () => void;
  loading?: boolean;
}

export function WelcomeScreen({
  onGetStarted,
  loading = false,
}: WelcomeScreenProps) {
  const t = useTranslations('onboarding.welcome');

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-lg text-center">
        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="mx-auto mb-8"
        >
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary/70 shadow-lg">
            <span className="font-bold text-2xl text-primary-foreground">
              T
            </span>
          </div>
        </motion.div>

        {/* Welcome Text */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.5 }}
          className="mb-3 font-bold text-3xl tracking-tight md:text-4xl"
        >
          {t('title')}
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="mb-2 text-muted-foreground text-lg md:text-xl"
        >
          {t('subtitle')}
        </motion.p>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="mx-auto mb-10 max-w-md text-muted-foreground"
        >
          {t('description')}
        </motion.p>

        {/* CTA Button */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
        >
          <Button
            onClick={onGetStarted}
            disabled={loading}
            size="lg"
            className="gap-2 px-8 py-6 text-lg"
          >
            {loading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                {t('setting-up')}
              </>
            ) : (
              <>
                {t('get-started')}
                <ArrowRight className="h-5 w-5" />
              </>
            )}
          </Button>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.5 }}
            className="mt-4 text-muted-foreground text-sm"
          >
            {t('completion-time')}
          </motion.p>
        </motion.div>
      </div>
    </div>
  );
}
