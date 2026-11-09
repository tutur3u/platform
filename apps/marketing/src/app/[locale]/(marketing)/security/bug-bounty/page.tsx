import {
  ArrowRight,
  Bug,
  FileText,
  Mail,
  ScanSearch,
  Shield,
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
  LedgerMetric,
  type ProgramStep,
  ProgramStepCard,
  type Researcher,
  ResearcherCard,
} from './bug-bounty-components';

interface MetadataProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({
  params,
}: MetadataProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations('bug-bounty');

  return getMarketingMetadata(
    {
      title: t('meta.title'),
      description: t('meta.description'),
      pathname: '/security/bug-bounty',
    },
    locale
  );
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
    <main className="relative w-full overflow-x-hidden">
      <PageHero
        accent="green"
        actions={
          <>
            <ActionLink href="mailto:security@tuturuuu.com">
              <Mail className="h-4 w-4" />
              {t('hero.report_cta')}
            </ActionLink>
            <ActionLink href="/security/policy" variant="ghost">
              <FileText className="h-4 w-4" />
              {t('hero.policy_cta')}
            </ActionLink>
          </>
        }
        description={t('hero.description')}
        eyebrow={t('hero.badge')}
        eyebrowIcon={Shield}
        highlight={t('hero.title_highlight')}
        title={t('hero.title_prefix')}
      >
        <Panel className="p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="font-mono-ui text-[0.62rem] text-dynamic-blue/80 uppercase tracking-[0.18em]">
                {t('community.eyebrow')}
              </p>
              <h2 className="mt-2 font-display font-semibold text-2xl tracking-[-0.02em]">
                {t('community.title')}
              </h2>
              <p className="mt-2 max-w-xl text-foreground/55 text-sm leading-relaxed">
                {t('community.description')}
              </p>
            </div>
            <Trophy className="h-8 w-8 shrink-0 text-dynamic-yellow/80" />
          </div>

          {/* The report count is the length of the roster below, so the
              ledger and the hall of fame can never disagree. */}
          <div className="mt-8 grid divide-y divide-foreground/[0.07] border-foreground/[0.07] border-t sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <LedgerMetric
              label={t('community.metrics.reports')}
              value={String(researchers.length)}
            />
            <LedgerMetric
              label={t('community.metrics.credit')}
              value={t('community.public_credit')}
            />
            <LedgerMetric
              label={t('community.metrics.channel')}
              value="security@tuturuuu.com"
            />
          </div>
        </Panel>
      </PageHero>

      <SectionShell
        bloom="green"
        eyebrow={t('hall.badge')}
        index="01"
        subtitle={t('hall.description')}
        title={t('hall.title')}
        width="wide"
      >
        <RevealGroup className="grid gap-3 lg:grid-cols-2" stagger={0.1}>
          {researchers.map((researcher) => (
            <RevealItem className="h-full" key={researcher.name}>
              <ResearcherCard researcher={researcher} />
            </RevealItem>
          ))}
        </RevealGroup>
      </SectionShell>

      <SectionShell
        bloom="cyan"
        eyebrow={t('hall.badge')}
        index="02"
        subtitle={t('program.description')}
        title={t('program.title')}
        width="wide"
      >
        <Reveal>
          <RevealGroup className="grid gap-3 sm:grid-cols-2" stagger={0.06}>
            {programSteps.map((step) => (
              <RevealItem className="h-full" key={step.title}>
                <ProgramStepCard step={step} />
              </RevealItem>
            ))}
          </RevealGroup>
        </Reveal>

        <Reveal delay={0.1}>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <ActionLink href="mailto:security@tuturuuu.com">
              <Mail className="h-4 w-4" />
              {t('program.contact_cta')}
            </ActionLink>
            <ActionLink href="/security" variant="ghost">
              <Shield className="h-4 w-4" />
              {t('program.security_cta')}
              <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
            </ActionLink>
          </div>
        </Reveal>
      </SectionShell>
    </main>
  );
}
