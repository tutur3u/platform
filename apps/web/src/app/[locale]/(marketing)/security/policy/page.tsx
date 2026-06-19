import {
  ArrowRight,
  Bug,
  CheckCircle2,
  FileText,
  ListChecks,
  Lock,
  Mail,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Trophy,
} from '@tuturuuu/icons/lucide';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import {
  type ListPanel,
  type PolicyCard,
  PolicyChecklistItem,
  PolicyInfoCard,
  PolicyListPanel,
  PolicyMetric,
  SectionHeader,
} from './policy-components';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('security-policy');

  return {
    title: t('meta.title'),
    description: t('meta.description'),
  };
}

export default async function SecurityPolicyPage() {
  const t = await getTranslations('security-policy');

  const workflowCards: PolicyCard[] = [
    {
      className:
        'border-dynamic-blue/25 bg-linear-to-br from-dynamic-blue/10 via-background to-background',
      description: t('workflow.steps.private.description'),
      icon: Mail,
      iconClassName: 'bg-dynamic-blue/10 text-dynamic-blue',
      title: t('workflow.steps.private.title'),
    },
    {
      className:
        'border-dynamic-green/25 bg-linear-to-br from-dynamic-green/10 via-background to-background',
      description: t('workflow.steps.safe.description'),
      icon: ShieldCheck,
      iconClassName: 'bg-dynamic-green/10 text-dynamic-green',
      title: t('workflow.steps.safe.title'),
    },
    {
      className:
        'border-dynamic-yellow/25 bg-linear-to-br from-dynamic-yellow/10 via-background to-background',
      description: t('workflow.steps.credit.description'),
      icon: Trophy,
      iconClassName: 'bg-dynamic-yellow/10 text-dynamic-yellow',
      title: t('workflow.steps.credit.title'),
    },
  ];

  const scopePanels: ListPanel[] = [
    {
      className: 'border-dynamic-green/25 bg-dynamic-green/5',
      icon: CheckCircle2,
      iconClassName: 'text-dynamic-green',
      items: [
        t('scope.in_scope.items.core'),
        t('scope.in_scope.items.auth'),
        t('scope.in_scope.items.data'),
        t('scope.in_scope.items.public_apps'),
      ],
      title: t('scope.in_scope.title'),
    },
    {
      className: 'border-dynamic-orange/25 bg-dynamic-orange/5',
      icon: ShieldAlert,
      iconClassName: 'text-dynamic-orange',
      items: [
        t('scope.out_of_scope.items.social'),
        t('scope.out_of_scope.items.dos'),
        t('scope.out_of_scope.items.physical'),
        t('scope.out_of_scope.items.upstream'),
      ],
      title: t('scope.out_of_scope.title'),
    },
  ];

  const rules = [
    t('rules.items.private'),
    t('rules.items.minimum'),
    t('rules.items.no_persistence'),
    t('rules.items.no_data_access'),
    t('rules.items.no_service_disruption'),
  ];

  const reportDetails = [
    t('rules.include.items.summary'),
    t('rules.include.items.steps'),
    t('rules.include.items.impact'),
    t('rules.include.items.contact'),
  ];

  const responseCards: PolicyCard[] = [
    {
      className: 'border-dynamic-cyan/25 bg-background/80',
      description: t('response.items.ack.description'),
      icon: Mail,
      iconClassName: 'bg-dynamic-cyan/10 text-dynamic-cyan',
      title: t('response.items.ack.title'),
    },
    {
      className: 'border-dynamic-purple/25 bg-background/80',
      description: t('response.items.triage.description'),
      icon: ListChecks,
      iconClassName: 'bg-dynamic-purple/10 text-dynamic-purple',
      title: t('response.items.triage.title'),
    },
    {
      className: 'border-dynamic-green/25 bg-background/80',
      description: t('response.items.credit.description'),
      icon: Trophy,
      iconClassName: 'bg-dynamic-green/10 text-dynamic-green',
      title: t('response.items.credit.title'),
    },
  ];

  return (
    <main className="relative w-full overflow-x-hidden text-balance">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[linear-gradient(to_right,hsl(var(--border))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border))_1px,transparent_1px)] bg-[size:56px_56px] opacity-25" />
      <div className="pointer-events-none fixed inset-0 -z-10 bg-linear-to-br from-dynamic-blue/10 via-transparent to-dynamic-green/10" />

      <section className="px-4 pt-24 pb-12 sm:px-6 sm:pt-28 lg:px-8 lg:pt-32 lg:pb-16">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(340px,0.72fr)] lg:items-center">
          <div>
            <Badge
              variant="secondary"
              className="mb-6 border-dynamic-blue/30 bg-dynamic-blue/10 text-dynamic-blue"
            >
              <Shield className="mr-1.5 h-3.5 w-3.5" />
              {t('hero.badge')}
            </Badge>

            <h1 className="max-w-5xl font-bold text-4xl tracking-tight sm:text-5xl lg:text-6xl xl:text-7xl">
              {t('hero.title_prefix')}{' '}
              <span className="bg-linear-to-r from-dynamic-blue via-dynamic-cyan to-dynamic-green bg-clip-text text-transparent">
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
                <Link href="/security/bug-bounty">
                  <Trophy className="mr-2 h-5 w-5" />
                  {t('hero.hall_cta')}
                </Link>
              </Button>
            </div>
          </div>

          <Card className="border-dynamic-cyan/30 bg-background/85 p-6 shadow-lg backdrop-blur">
            <div className="mb-6 flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-dynamic-cyan/10 text-dynamic-cyan">
                <Lock className="h-6 w-6" />
              </div>
              <div>
                <p className="font-medium text-dynamic-cyan text-sm uppercase tracking-wider">
                  {t('reporting.eyebrow')}
                </p>
                <h2 className="mt-2 font-semibold text-2xl">
                  {t('reporting.title')}
                </h2>
                <p className="mt-2 text-foreground/60 text-sm leading-relaxed">
                  {t('reporting.description')}
                </p>
              </div>
            </div>

            <div className="grid gap-3">
              <PolicyMetric
                label={t('reporting.email_label')}
                value="security@tuturuuu.com"
              />
              <PolicyMetric
                label={t('reporting.ack_label')}
                value={t('reporting.ack_value')}
              />
              <PolicyMetric
                label={t('reporting.credit_label')}
                value={t('reporting.credit_value')}
              />
            </div>
          </Card>
        </div>
      </section>

      <section className="px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <SectionHeader
            badge={t('workflow.badge')}
            description={t('workflow.description')}
            icon={FileText}
            title={t('workflow.title')}
          />

          <div className="grid gap-5 md:grid-cols-3">
            {workflowCards.map((card) => (
              <PolicyInfoCard key={card.title} card={card} />
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <SectionHeader
            badge={t('scope.badge')}
            description={t('scope.description')}
            icon={Shield}
            title={t('scope.title')}
          />

          <div className="grid gap-5 lg:grid-cols-2">
            {scopePanels.map((panel) => (
              <PolicyListPanel key={panel.title} panel={panel} />
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <Card className="border-dynamic-orange/25 bg-background/85 p-6 shadow-sm sm:p-8">
            <Badge
              variant="secondary"
              className="mb-5 border-dynamic-orange/30 bg-dynamic-orange/10 text-dynamic-orange"
            >
              <Bug className="mr-1.5 h-3.5 w-3.5" />
              {t('rules.badge')}
            </Badge>
            <h2 className="font-semibold text-3xl sm:text-4xl">
              {t('rules.title')}
            </h2>
            <p className="mt-4 text-foreground/65 leading-relaxed">
              {t('rules.description')}
            </p>

            <div className="mt-6 grid gap-3">
              {rules.map((rule) => (
                <PolicyChecklistItem key={rule}>{rule}</PolicyChecklistItem>
              ))}
            </div>
          </Card>

          <Card className="border-dynamic-blue/25 bg-linear-to-br from-dynamic-blue/10 via-background to-background p-6 shadow-sm sm:p-8">
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-lg bg-dynamic-blue/10 text-dynamic-blue">
              <ListChecks className="h-6 w-6" />
            </div>
            <h3 className="font-semibold text-2xl">
              {t('rules.include.title')}
            </h3>
            <div className="mt-6 grid gap-3">
              {reportDetails.map((item) => (
                <PolicyChecklistItem key={item}>{item}</PolicyChecklistItem>
              ))}
            </div>
          </Card>
        </div>
      </section>

      <section className="px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <SectionHeader
            badge={t('response.badge')}
            description={t('response.description')}
            icon={ShieldCheck}
            title={t('response.title')}
          />

          <div className="grid gap-5 md:grid-cols-3">
            {responseCards.map((card) => (
              <PolicyInfoCard key={card.title} card={card} />
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 pt-10 pb-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <Card className="overflow-hidden border-dynamic-green/30 bg-linear-to-r from-dynamic-green/10 via-background to-dynamic-cyan/10 p-6 sm:p-8">
            <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
              <div>
                <h2 className="font-semibold text-3xl">{t('cta.title')}</h2>
                <p className="mt-3 max-w-3xl text-foreground/65 leading-relaxed">
                  {t('cta.description')}
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button size="lg" asChild>
                  <a href="mailto:security@tuturuuu.com">
                    <Mail className="mr-2 h-5 w-5" />
                    {t('cta.report_cta')}
                  </a>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <Link href="/security/bug-bounty">
                    {t('cta.hall_cta')}
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Link>
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </section>
    </main>
  );
}
