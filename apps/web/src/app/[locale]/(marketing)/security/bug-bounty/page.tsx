import {
  ArrowRight,
  Bug,
  FileText,
  Mail,
  ScanSearch,
  Shield,
  ShieldCheck,
  Trophy,
  Users,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import { cn } from '@tuturuuu/utils/format';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import {
  badgeAccentClasses,
  LedgerMetric,
  type ProgramStep,
  ProgramStepCard,
  type Researcher,
  ResearcherCard,
} from './bug-bounty-components';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('bug-bounty');

  return {
    title: t('meta.title'),
    description: t('meta.description'),
  };
}

export default async function BugBountyPage() {
  const t = await getTranslations('bug-bounty');

  const researchers: Researcher[] = [
    {
      accent: 'green',
      cwe: t('researchers.rana.cwe'),
      date: t('researchers.rana.date'),
      icon: ScanSearch,
      impact: t('researchers.rana.impact'),
      name: t('researchers.rana.name'),
      note: t('researchers.rana.note'),
      report: t('researchers.rana.report'),
      status: t('researchers.rana.status'),
    },
    {
      accent: 'orange',
      cwe: t('researchers.vapour.cwe'),
      date: t('researchers.vapour.date'),
      icon: Bug,
      impact: t('researchers.vapour.impact'),
      name: t('researchers.vapour.name'),
      note: t('researchers.vapour.note'),
      report: t('researchers.vapour.report'),
      status: t('researchers.vapour.status'),
    },
  ];

  const programSteps: ProgramStep[] = [
    {
      description: t('program.steps.private.description'),
      icon: Mail,
      title: t('program.steps.private.title'),
    },
    {
      description: t('program.steps.triage.description'),
      icon: ShieldCheck,
      title: t('program.steps.triage.title'),
    },
    {
      description: t('program.steps.scope.description'),
      icon: Shield,
      title: t('program.steps.scope.title'),
    },
    {
      description: t('program.steps.credit.description'),
      icon: Trophy,
      title: t('program.steps.credit.title'),
    },
  ];

  return (
    <main className="relative w-full overflow-x-hidden text-balance">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[linear-gradient(to_right,hsl(var(--border))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border))_1px,transparent_1px)] bg-[size:56px_56px] opacity-30" />
      <div className="pointer-events-none fixed inset-0 -z-10 bg-linear-to-br from-dynamic-green/10 via-transparent to-dynamic-orange/10" />

      <section className="px-4 pt-24 pb-10 sm:px-6 sm:pt-28 sm:pb-12 lg:px-8 lg:pt-32 lg:pb-16">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.82fr)] lg:items-center">
          <div>
            <Badge
              variant="secondary"
              className={cn('mb-6', badgeAccentClasses.green)}
            >
              <Shield className="mr-1.5 h-3.5 w-3.5" />
              {t('hero.badge')}
            </Badge>

            <h1 className="max-w-5xl font-bold text-4xl tracking-tight sm:text-5xl lg:text-6xl xl:text-7xl">
              {t('hero.title_prefix')}{' '}
              <span className="bg-linear-to-r from-dynamic-green via-dynamic-cyan to-dynamic-orange bg-clip-text text-transparent">
                {t('hero.title_highlight')}
              </span>
            </h1>

            <p className="mt-6 max-w-3xl text-foreground/70 text-lg leading-relaxed sm:text-xl">
              {t('hero.description')}
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button size="lg" asChild>
                <a href="mailto:security@tuturuuu.com">
                  <Mail className="mr-2 h-5 w-5" />
                  {t('hero.report_cta')}
                </a>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="/security/policy">
                  <FileText className="mr-2 h-5 w-5" />
                  {t('hero.policy_cta')}
                </Link>
              </Button>
            </div>
          </div>

          <Card className="border-dynamic-blue/30 bg-background/80 p-6 shadow-lg backdrop-blur">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-medium text-dynamic-blue text-sm uppercase tracking-wider">
                  {t('community.eyebrow')}
                </p>
                <h2 className="mt-3 font-semibold text-2xl">
                  {t('community.title')}
                </h2>
                <p className="mt-3 text-foreground/60 text-sm leading-relaxed">
                  {t('community.description')}
                </p>
              </div>
              <Trophy className="h-10 w-10 shrink-0 text-dynamic-yellow" />
            </div>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <LedgerMetric label={t('community.metrics.reports')} value="2" />
              <LedgerMetric
                label={t('community.metrics.credit')}
                value={t('community.public_credit')}
              />
              <LedgerMetric
                className="sm:col-span-2"
                label={t('community.metrics.channel')}
                value="security@tuturuuu.com"
              />
            </div>
          </Card>
        </div>
      </section>

      <section className="px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <Badge
                variant="secondary"
                className={cn('mb-4', badgeAccentClasses.yellow)}
              >
                <Users className="mr-1.5 h-3.5 w-3.5" />
                {t('hall.badge')}
              </Badge>
              <h2 className="font-semibold text-3xl sm:text-4xl">
                {t('hall.title')}
              </h2>
            </div>
            <p className="max-w-xl text-foreground/60 leading-relaxed">
              {t('hall.description')}
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {researchers.map((researcher) => (
              <ResearcherCard key={researcher.name} researcher={researcher} />
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-14 pb-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
            <div>
              <h2 className="font-semibold text-3xl sm:text-4xl">
                {t('program.title')}
              </h2>
              <p className="mt-4 text-foreground/70 leading-relaxed">
                {t('program.description')}
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button size="lg" asChild>
                  <a href="mailto:security@tuturuuu.com">
                    <Mail className="mr-2 h-5 w-5" />
                    {t('program.contact_cta')}
                  </a>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <Link href="/security">
                    <Shield className="mr-2 h-5 w-5" />
                    {t('program.security_cta')}
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Link>
                </Button>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {programSteps.map((step) => (
                <ProgramStepCard key={step.title} step={step} />
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
