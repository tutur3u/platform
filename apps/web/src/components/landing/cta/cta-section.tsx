'use client';

import {
  ArrowRight,
  Globe,
  Lock,
  MessageSquare,
  Shield,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

export function CTASection() {
  const t = useTranslations('landing.cta');

  const trustItems = [
    {
      icon: Shield,
      label: t('trust.openSource'),
      containerClass:
        'bg-calendar-bg-green border-dynamic-light-green/20 hover:border-dynamic-light-green/40',
      iconClass: 'text-dynamic-light-green',
    },
    {
      icon: Lock,
      label: t('trust.security'),
      containerClass:
        'bg-calendar-bg-blue border-dynamic-light-blue/20 hover:border-dynamic-light-blue/40',
      iconClass: 'text-dynamic-light-blue',
    },
    {
      icon: Globe,
      label: t('trust.selfHost'),
      containerClass:
        'bg-calendar-bg-purple border-dynamic-light-purple/20 hover:border-dynamic-light-purple/40',
      iconClass: 'text-dynamic-light-purple',
    },
  ];

  return (
    <section className="relative px-4 py-16 pb-24 sm:px-6 sm:py-20 sm:pb-32 lg:px-8 lg:py-24 lg:pb-40">
      <div className="mx-auto max-w-4xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.6 }}
        >
          <div className="overflow-hidden rounded-2xl border border-foreground/10 bg-gradient-to-b from-foreground/5 to-background p-8 text-center sm:p-12">
            <h2 className="mb-4 font-bold text-3xl tracking-tight sm:text-4xl">
              {t('title')}
            </h2>
            <p className="mx-auto mb-8 max-w-xl text-foreground/60 text-lg">
              {t('description')}
            </p>

            {/* CTAs */}
            <div className="mb-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
              <Button
                size="lg"
                className="group w-full bg-dynamic-light-purple hover:bg-dynamic-light-purple/90 sm:w-auto"
                asChild
              >
                <Link href="/onboarding">
                  {t('primary')}
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="w-full sm:w-auto"
                asChild
              >
                <Link href="/contact">
                  <MessageSquare className="mr-2 h-4 w-4" />
                  {t('secondary')}
                </Link>
              </Button>
            </div>

            {/* Trust Items */}
            <div className="flex flex-wrap items-center justify-center gap-3 text-sm sm:gap-4">
              {trustItems.map((item) => (
                <div
                  key={item.label}
                  className={`flex items-center gap-2 rounded-full border px-4 py-2 transition-colors ${item.containerClass}`}
                >
                  <item.icon className={`h-4 w-4 ${item.iconClass}`} />
                  <span className="text-foreground/70">{item.label}</span>
                </div>
              ))}
            </div>

            {/* Note */}
            <p className="mt-6 text-foreground/40 text-sm">{t('note')}</p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
