import { createFileRoute } from '@tanstack/react-router';
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
import {
  SecurityBadge,
  SecurityCard,
  SecurityLinkButton,
} from '../../../components/security/security-page-primitives';
import {
  type ListPanel,
  type PolicyCard,
  PolicyChecklistItem,
  PolicyInfoCard,
  PolicyListPanel,
  PolicyMetric,
  SectionHeader,
} from '../../../components/security/security-subpage-components';
import { createPageHead } from '../../../lib/platform/head';

export const Route = createFileRoute('/$locale/security/policy')({
  component: SecurityPolicyPage,
  head: () =>
    createPageHead({
      description:
        'Read the Tuturuuu security policy for responsible disclosure, scope, safe testing rules, and response expectations.',
      title: 'Security Policy',
    }),
});

const workflowCards: PolicyCard[] = [
  {
    className:
      'border-dynamic-blue/25 bg-linear-to-br from-dynamic-blue/10 via-background to-background',
    description:
      'Email security@tuturuuu.com with enough detail to reproduce the issue without publishing it first.',
    icon: Mail,
    iconClassName: 'bg-dynamic-blue/10 text-dynamic-blue',
    title: 'Report privately',
  },
  {
    className:
      'border-dynamic-green/25 bg-linear-to-br from-dynamic-green/10 via-background to-background',
    description:
      'Keep testing narrow, avoid customer data, and stop when you have a clear proof of impact.',
    icon: ShieldCheck,
    iconClassName: 'bg-dynamic-green/10 text-dynamic-green',
    title: 'Test safely',
  },
  {
    className:
      'border-dynamic-yellow/25 bg-linear-to-br from-dynamic-yellow/10 via-background to-background',
    description:
      'When the issue is resolved and the researcher wants recognition, we can publish verified credit in the Hall of Fame.',
    icon: Trophy,
    iconClassName: 'bg-dynamic-yellow/10 text-dynamic-yellow',
    title: 'Credit verified work',
  },
];

const scopePanels: ListPanel[] = [
  {
    className: 'border-dynamic-green/25 bg-dynamic-green/5',
    icon: CheckCircle2,
    iconClassName: 'text-dynamic-green',
    items: [
      'Tuturuuu web products, public app routes, APIs, and workspace features.',
      'Authentication, authorization, session handling, and cross-workspace access controls.',
      'Issues that expose, modify, or destroy user, workspace, billing, or private content.',
      'Public Tuturuuu-controlled domains and integrations where user impact can be shown safely.',
    ],
    title: 'In scope',
  },
  {
    className: 'border-dynamic-orange/25 bg-dynamic-orange/5',
    icon: ShieldAlert,
    iconClassName: 'text-dynamic-orange',
    items: [
      'Social engineering, phishing, harassment, or attempts to target Tuturuuu staff or users.',
      'Denial-of-service, load testing, spam, automated scanning at scale, or resource exhaustion.',
      'Physical attacks, employee device compromise, or issues requiring stolen credentials.',
      'Provider-native behavior without a demonstrated Tuturuuu product impact.',
    ],
    title: 'Out of scope',
  },
];

const rules = [
  'Report privately to security@tuturuuu.com before public disclosure.',
  'Use minimal, non-destructive testing and stop once impact is demonstrated.',
  'Do not establish persistence, backdoors, malware, or ongoing access.',
  'Do not access, modify, delete, or exfiltrate data that is not yours.',
  'Do not run denial-of-service, spam, resource exhaustion, or availability-impacting tests.',
];

const reportDetails = [
  'A short summary of the vulnerability and the affected Tuturuuu surface.',
  'Clear reproduction steps, screenshots, request logs, or a minimal proof of concept.',
  'The practical security impact and affected users, workspaces, or assets.',
  'Your preferred contact method and public credit name, if you want recognition.',
];

const responseCards: PolicyCard[] = [
  {
    className: 'border-dynamic-cyan/25 bg-background/80',
    description:
      'We acknowledge new reports within 24 hours when enough contact information is provided.',
    icon: Mail,
    iconClassName: 'bg-dynamic-cyan/10 text-dynamic-cyan',
    title: 'Acknowledge',
  },
  {
    className: 'border-dynamic-purple/25 bg-background/80',
    description:
      'We reproduce or validate the behavior, classify impact, and coordinate remediation.',
    icon: ListChecks,
    iconClassName: 'bg-dynamic-purple/10 text-dynamic-purple',
    title: 'Triage',
  },
  {
    className: 'border-dynamic-green/25 bg-background/80',
    description:
      'Verified researchers can be listed on the Hall of Fame with the name or handle they choose.',
    icon: Trophy,
    iconClassName: 'bg-dynamic-green/10 text-dynamic-green',
    title: 'Credit',
  },
];

export default function SecurityPolicyPage() {
  return (
    <main className="relative w-full overflow-x-hidden text-balance">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[linear-gradient(to_right,hsl(var(--border))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border))_1px,transparent_1px)] bg-[size:56px_56px] opacity-25" />
      <div className="pointer-events-none fixed inset-0 -z-10 bg-linear-to-br from-dynamic-blue/10 via-transparent to-dynamic-green/10" />

      <section className="px-4 pt-24 pb-12 sm:px-6 sm:pt-28 lg:px-8 lg:pt-32 lg:pb-16">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(340px,0.72fr)] lg:items-center">
          <div>
            <SecurityBadge className="mb-6 border-dynamic-blue/30 bg-dynamic-blue/10 text-dynamic-blue">
              <Shield className="mr-1.5 h-3.5 w-3.5" />
              Security policy
            </SecurityBadge>

            <h1 className="max-w-5xl font-bold text-4xl tracking-tight sm:text-5xl lg:text-6xl xl:text-7xl">
              Tuturuuu security policy for{' '}
              <span className="bg-linear-to-r from-dynamic-blue via-dynamic-cyan to-dynamic-green bg-clip-text text-transparent">
                responsible disclosure
              </span>
            </h1>

            <p className="mt-6 max-w-3xl text-foreground/70 text-lg leading-relaxed sm:text-xl">
              How to report vulnerabilities safely, what is in scope, and how we
              coordinate fixes and public credit.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <SecurityLinkButton href="mailto:security@tuturuuu.com">
                <Mail className="mr-2 h-5 w-5" />
                Report privately
              </SecurityLinkButton>
              <SecurityLinkButton href="/security/bug-bounty" variant="outline">
                <Trophy className="mr-2 h-5 w-5" />
                View Hall of Fame
              </SecurityLinkButton>
            </div>
          </div>

          <SecurityCard className="border-dynamic-cyan/30 bg-background/85 p-6 shadow-lg backdrop-blur">
            <div className="mb-6 flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-dynamic-cyan/10 text-dynamic-cyan">
                <Lock className="h-6 w-6" />
              </div>
              <div>
                <p className="font-medium text-dynamic-cyan text-sm uppercase tracking-wider">
                  Report channel
                </p>
                <h2 className="mt-2 font-semibold text-2xl">
                  Send vulnerability reports privately
                </h2>
                <p className="mt-2 text-foreground/60 text-sm leading-relaxed">
                  Use one private channel for initial reports so we can triage
                  quickly and protect users while the issue is unresolved.
                </p>
              </div>
            </div>

            <div className="grid gap-3">
              <PolicyMetric
                label="Private inbox"
                value="security@tuturuuu.com"
              />
              <PolicyMetric label="Initial response" value="Within 24 hours" />
              <PolicyMetric
                label="Recognition"
                value="Optional public credit"
              />
            </div>
          </SecurityCard>
        </div>
      </section>

      <section className="px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <SectionHeader
            badge="Process"
            description="Responsible disclosure works best when reports stay private, reproduction is safe, and verified scope is written precisely."
            icon={FileText}
            title="Responsible disclosure flow"
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
            badge="Scope"
            description="Focus on vulnerabilities that affect Tuturuuu-managed products, user data, authentication, authorization, or production service integrity."
            icon={Shield}
            title="Scope and boundaries"
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
          <SecurityCard className="border-dynamic-orange/25 bg-background/85 p-6 shadow-sm sm:p-8">
            <SecurityBadge className="mb-5 border-dynamic-orange/30 bg-dynamic-orange/10 text-dynamic-orange">
              <Bug className="mr-1.5 h-3.5 w-3.5" />
              Safe testing
            </SecurityBadge>
            <h2 className="font-semibold text-3xl sm:text-4xl">
              Rules of engagement
            </h2>
            <p className="mt-4 text-foreground/65 leading-relaxed">
              Please use the smallest proof needed to show impact and avoid
              actions that could harm customers, workspaces, data, or service
              availability.
            </p>
            <div className="mt-6 grid gap-3">
              {rules.map((rule) => (
                <PolicyChecklistItem key={rule}>{rule}</PolicyChecklistItem>
              ))}
            </div>
          </SecurityCard>

          <SecurityCard className="border-dynamic-blue/25 bg-linear-to-br from-dynamic-blue/10 via-background to-background p-6 shadow-sm sm:p-8">
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-lg bg-dynamic-blue/10 text-dynamic-blue">
              <ListChecks className="h-6 w-6" />
            </div>
            <h3 className="font-semibold text-2xl">What to include</h3>
            <div className="mt-6 grid gap-3">
              {reportDetails.map((item) => (
                <PolicyChecklistItem key={item}>{item}</PolicyChecklistItem>
              ))}
            </div>
          </SecurityCard>
        </div>
      </section>

      <section className="px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <SectionHeader
            badge="Response"
            description="We prioritize confirmed impact, communicate next steps, and keep public credit aligned with the verified scope."
            icon={ShieldCheck}
            title="What happens after you report"
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
          <SecurityCard className="overflow-hidden border-dynamic-green/30 bg-linear-to-r from-dynamic-green/10 via-background to-dynamic-cyan/10 p-6 sm:p-8">
            <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
              <div>
                <h2 className="font-semibold text-3xl">Ready to report?</h2>
                <p className="mt-3 max-w-3xl text-foreground/65 leading-relaxed">
                  Send the report privately first. We will acknowledge it,
                  validate impact, coordinate a fix, and discuss public credit
                  when the issue is resolved.
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <SecurityLinkButton href="mailto:security@tuturuuu.com">
                  <Mail className="mr-2 h-5 w-5" />
                  Email security team
                </SecurityLinkButton>
                <SecurityLinkButton
                  href="/security/bug-bounty"
                  variant="outline"
                >
                  View Hall of Fame
                  <ArrowRight className="ml-2 h-5 w-5" />
                </SecurityLinkButton>
              </div>
            </div>
          </SecurityCard>
        </div>
      </section>
    </main>
  );
}
