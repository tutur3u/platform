'use client';

import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader } from '@tuturuuu/ui/card';
import {
  ArrowRight,
  CheckCircle,
  Rocket,
  Settings,
  Users,
  Zap,
} from '@tuturuuu/ui/icons';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';

interface WelcomeScreenProps {
  onGetStarted: () => void;
}

export function WelcomeScreen({ onGetStarted }: WelcomeScreenProps) {
  const t = useTranslations('onboarding.welcome');

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-5xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center"
        >
          {/* Header */}
          <div className="mx-auto mb-8 flex h-16 w-16 items-center justify-center rounded-full shadow-lg">
            <Rocket className="h-8 w-8 text-white" />
          </div>

          <h1 className="mb-4 font-bold text-4xl text-gray-900 md:text-5xl dark:text-white">
            {t('title')}
          </h1>

          <p className="mb-6 text-gray-600 text-xl md:text-2xl dark:text-gray-300">
            {t('subtitle')}
          </p>

          <p className="mx-auto mb-12 max-w-2xl text-gray-600 text-lg dark:text-gray-400">
            {t('description')}
          </p>
        </motion.div>

        {/* Features */}
        <div className="mb-12 grid gap-6 md:grid-cols-3">
          <Card className="border bg-white shadow-sm transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-gray-800">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900">
                  <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <h3 className="font-semibold">
                  {t('features.team-collaboration.title')}
                </h3>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 text-sm dark:text-gray-400">
                {t('features.team-collaboration.description')}
              </p>
            </CardContent>
          </Card>

          <Card className="border bg-white shadow-sm transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-gray-800">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900">
                  <Zap className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <h3 className="font-semibold">
                  {t('features.powerful-tools.title')}
                </h3>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 text-sm dark:text-gray-400">
                {t('features.powerful-tools.description')}
              </p>
            </CardContent>
          </Card>

          <Card className="border bg-white shadow-sm transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-gray-800">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900">
                  <Settings className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
                <h3 className="font-semibold">
                  {t('features.easy-setup.title')}
                </h3>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 text-sm dark:text-gray-400">
                {t('features.easy-setup.description')}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* What's Next */}
        <Card className="mb-8 border bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <CardHeader>
            <h3 className="text-center font-semibold text-lg">
              {t('ready-to-start')}
            </h3>
            <p className="text-center text-gray-600 dark:text-gray-400">
              {t('setup-steps')}
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              <div className="flex items-center gap-3 rounded-lg bg-gray-50 p-3 dark:bg-gray-900">
                <CheckCircle className="h-5 w-5 flex-shrink-0 text-green-500" />
                <span className="font-medium text-sm">
                  {t('steps.create-workspace')}
                </span>
              </div>
              <div className="flex items-center gap-3 rounded-lg bg-gray-50 p-3 dark:bg-gray-900">
                <CheckCircle className="h-5 w-5 flex-shrink-0 text-blue-500" />
                <span className="font-medium text-sm">
                  {t('steps.setup-profile')}
                </span>
              </div>
              <div className="flex items-center gap-3 rounded-lg bg-gray-50 p-3 dark:bg-gray-900">
                <CheckCircle className="h-5 w-5 flex-shrink-0 text-purple-500" />
                <span className="font-medium text-sm">
                  {t('steps.configure-settings')}
                </span>
              </div>
              <div className="flex items-center gap-3 rounded-lg bg-gray-50 p-3 dark:bg-gray-900">
                <CheckCircle className="h-5 w-5 flex-shrink-0 text-indigo-500" />
                <span className="font-medium text-sm">
                  {t('steps.start-collaborating')}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Get Started Button */}
        <div className="text-center">
          <Button onClick={onGetStarted} size="lg">
            {t('get-started')}
            <ArrowRight className="ml-2 h-5 w-5" />
          </Button>

          <p className="mt-4 text-gray-500 text-sm dark:text-gray-400">
            {t('completion-time')}
          </p>
        </div>
      </div>
    </div>
  );
}
