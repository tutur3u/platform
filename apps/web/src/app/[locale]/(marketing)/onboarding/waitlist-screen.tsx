import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Clock, ExternalLink, Users } from '@tuturuuu/ui/icons';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

export function WaitlistScreen() {
  const t = useTranslations('onboarding.waitlist');

  return (
    <div className="flex min-h-screen">
      {/* Main Content */}
      <div className="flex flex-1 items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-lg space-y-8"
        >
          {/* Logo and Title */}
          <div className="text-balance text-center">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-foreground text-background shadow-lg">
              <Clock className="h-8 w-8" />
            </div>
            <h1 className="mb-4 font-bold text-3xl md:text-4xl">
              {t('title')}
            </h1>
            <p className="text-lg">{t('description')}</p>
          </div>

          {/* Status Card */}
          <Card className="border shadow-lg">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center justify-center gap-2 text-lg">
                <Users className="h-5 w-5" />
                {t('status')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center gap-3 rounded-lg p-4">
                <span className="text-sm">{t('email-notification')}</span>
              </div>
            </CardContent>
          </Card>

          {/* Help Section */}
          <div className="rounded-lg p-4 text-center">
            <Link
              href="/contact"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 font-medium transition-colors hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
            >
              {t('get-in-touch')}
              <ExternalLink className="h-4 w-4" />
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
