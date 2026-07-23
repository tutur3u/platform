import {
  ArrowRight,
  Bug,
  CheckCircle2,
  ListChecks,
  Lock,
  Mail,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Trophy,
} from '@tuturuuu/icons/lucide';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import {
  Reveal,
  RevealGroup,
  RevealItem,
} from '@/components/landing/shared/reveal';
import { Panel, SectionShell } from '@/components/landing/shared/section-shell';
import { ActionLink } from '@/components/marketing/action-link';
import { PageHero } from '@/components/marketing/page-hero';
import { getMarketingMetadata } from '@/lib/seo/marketing-metadata';
import {
  type ListPanel,
  type PolicyCard,
  PolicyChecklistItem,
  PolicyInfoCard,
  PolicyListPanel,
  PolicyMetric,
  PolicyMetrics,
} from './policy-components';

interface MetadataProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({
  params,
}: MetadataProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations('security-policy');

  return getMarketingMetadata(
    {
      title: t('meta.title'),
      description: t('meta.description'),
      pathname: '/security/policy',
    },
    locale
  );
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
    <main className="relative w-full overflow-x-hidden">
      <PageHero
        accent="blue"
        actions={
          <>
            <ActionLink href="mailto:security@tuturuuu.com">
              <Mail className="h-4 w-4" />
              {t('hero.report_cta')}
            </ActionLink>
            <ActionLink href="/security/bug-bounty" variant="ghost">
              <Trophy className="h-4 w-4" />
              {t('hero.hall_cta')}
            </ActionLink>
          </>
        }
        description={t('hero.description')}
        eyebrow={t('hero.badge')}
        eyebrowIcon={Shield}
        highlight={t('hero.title_highlight')}
        title={t('hero.title_prefix')}
      >
        {/* Where to send it, and what happens after — the three facts a
            researcher needs before reading any of the policy below. */}
        <Panel className="p-6 sm:p-8">
          <div className="flex items-start gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-dynamic-cyan/25 bg-dynamic-cyan/10 text-dynamic-cyan">
              <Lock className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="font-mono-ui text-[0.62rem] text-dynamic-cyan/80 uppercase tracking-[0.18em]">
                {t('reporting.eyebrow')}
              </p>
              <h2 className="mt-2 font-display font-semibold text-2xl tracking-[-0.02em]">
                {t('reporting.title')}
              </h2>
              <p className="mt-2 text-foreground/55 text-sm leading-relaxed">
                {t('reporting.description')}
              </p>
            </div>
          </div>

          <PolicyMetrics>
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
          </PolicyMetrics>
        </Panel>
      </PageHero>

      <SectionShell
        bloom="blue"
        eyebrow={t('workflow.badge')}
        index="01"
        subtitle={t('workflow.description')}
        title={t('workflow.title')}
        width="wide"
      >
        <RevealGroup className="grid gap-3 md:grid-cols-3" stagger={0.08}>
          {workflowCards.map((card) => (
            <RevealItem className="h-full" key={card.title}>
              <PolicyInfoCard card={card} />
            </RevealItem>
          ))}
        </RevealGroup>
      </SectionShell>

      <SectionShell
        bloom="cyan"
        eyebrow={t('scope.badge')}
        index="02"
        subtitle={t('scope.description')}
        title={t('scope.title')}
        width="wide"
      >
        <RevealGroup className="grid gap-3 lg:grid-cols-2" stagger={0.1}>
          {scopePanels.map((panel) => (
            <RevealItem className="h-full" key={panel.title}>
              <PolicyListPanel panel={panel} />
            </RevealItem>
          ))}
        </RevealGroup>
      </SectionShell>

      <SectionShell
        bloom="orange"
        eyebrow={t('rules.badge')}
        index="03"
        subtitle={t('rules.description')}
        title={t('rules.title')}
        width="wide"
      >
        <Reveal>
          <div className="grid gap-3 lg:grid-cols-[1.05fr_0.95fr]">
            <Panel className="p-6 sm:p-8">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-dynamic-orange/25 bg-dynamic-orange/10 text-dynamic-orange">
                  <Bug className="h-4 w-4" />
                </span>
                <h3 className="font-display font-semibold text-xl tracking-[-0.02em]">
                  {t('rules.badge')}
                </h3>
              </div>
              <ul className="mt-6 grid gap-2">
                {rules.map((rule) => (
                  <PolicyChecklistItem key={rule}>{rule}</PolicyChecklistItem>
                ))}
              </ul>
            </Panel>

            <Panel className="p-6 sm:p-8">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-dynamic-blue/25 bg-dynamic-blue/10 text-dynamic-blue">
                  <ListChecks className="h-4 w-4" />
                </span>
                <h3 className="font-display font-semibold text-xl tracking-[-0.02em]">
                  {t('rules.include.title')}
                </h3>
              </div>
              <ul className="mt-6 grid gap-2">
                {reportDetails.map((item) => (
                  <PolicyChecklistItem key={item}>{item}</PolicyChecklistItem>
                ))}
              </ul>
            </Panel>
          </div>
        </Reveal>
      </SectionShell>

      <SectionShell
        bloom="green"
        eyebrow={t('response.badge')}
        index="04"
        subtitle={t('response.description')}
        title={t('response.title')}
        width="wide"
      >
        <RevealGroup className="grid gap-3 md:grid-cols-3" stagger={0.08}>
          {responseCards.map((card) => (
            <RevealItem className="h-full" key={card.title}>
              <PolicyInfoCard card={card} />
            </RevealItem>
          ))}
        </RevealGroup>
      </SectionShell>

      <SectionShell
        bloom="green"
        eyebrow={t('response.badge')}
        index="05"
        subtitle={t('cta.description')}
        title={t('cta.title')}
      >
        <Reveal>
          <Panel className="flex flex-col items-center px-6 py-12 text-center sm:px-12">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-dynamic-green/25 bg-dynamic-green/10">
              <ShieldCheck className="h-6 w-6 text-dynamic-green" />
            </span>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <ActionLink href="mailto:security@tuturuuu.com">
                <Mail className="h-4 w-4" />
                {t('cta.report_cta')}
              </ActionLink>
              <ActionLink href="/security/bug-bounty" variant="ghost">
                {t('cta.hall_cta')}
                <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
              </ActionLink>
            </div>
          </Panel>
        </Reveal>
      </SectionShell>
    </main>
  );
}
