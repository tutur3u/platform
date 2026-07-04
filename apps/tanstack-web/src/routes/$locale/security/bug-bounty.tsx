import { createFileRoute } from '@tanstack/react-router';
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
} from '@tuturuuu/icons/lucide';
import {
  joinClassNames,
  SecurityBadge,
  SecurityCard,
  SecurityLinkButton,
} from '../../../components/security/security-page-primitives';
import {
  badgeAccentClasses,
  LedgerMetric,
  type ProgramStep,
  ProgramStepCard,
  type Researcher,
  ResearcherCard,
} from '../../../components/security/security-subpage-components';
import { createPageHead } from '../../../lib/platform/head';

export const Route = createFileRoute('/$locale/security/bug-bounty')({
  component: BugBountyPage,
  head: () =>
    createPageHead({
      description:
        'Meet the researchers recognized in the Tuturuuu Security Hall of Fame.',
      title: 'Security Hall of Fame',
    }),
});

const researchers: Researcher[] = [
  {
    accent: 'green',
    cwe: 'CWE-200 / CWE-284',
    date: 'May 18, 2026',
    icon: ScanSearch,
    impact:
      'Rana helped us tighten profile visibility around workspace boundaries.',
    name: 'Rana Zeeshan (nova cyber force)',
    note: 'Verified as a Tuturuuu-managed workspace privacy issue.',
    report: 'Profile visibility scope',
    status: 'Verified',
  },
  {
    accent: 'orange',
    cwe: 'CWE-79 / CWE-434',
    date: '2025-03-30',
    icon: Bug,
    impact:
      'Hiep helped surface unsafe SVG behavior in direct Supabase Storage file delivery.',
    name: 'Nguyen Nghia Hiep (vapour)',
    note: 'Verified and credited; this does not directly affect Tuturuuu products or infrastructure.',
    report: 'SVG storage delivery behavior',
    status: 'Verified',
  },
];

const programSteps: ProgramStep[] = [
  {
    description: 'Email security@tuturuuu.com before sharing details publicly.',
    icon: Mail,
    title: 'Report privately',
  },
  {
    description:
      'We review the report, confirm impact, and prioritize the right fix.',
    icon: ShieldCheck,
    title: 'We validate',
  },
  {
    description: 'Use the smallest proof needed and avoid destructive testing.',
    icon: Shield,
    title: 'Keep it safe',
  },
  {
    description:
      'Verified researchers can be listed here with the name or handle they choose.',
    icon: Trophy,
    title: 'Get credited',
  },
];

export default function BugBountyPage() {
  return (
    <main className="relative w-full overflow-x-hidden text-balance">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[linear-gradient(to_right,hsl(var(--border))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border))_1px,transparent_1px)] bg-[size:56px_56px] opacity-30" />
      <div className="pointer-events-none fixed inset-0 -z-10 bg-linear-to-br from-dynamic-green/10 via-transparent to-dynamic-orange/10" />

      <section className="px-4 pt-24 pb-10 sm:px-6 sm:pt-28 sm:pb-12 lg:px-8 lg:pt-32 lg:pb-16">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.82fr)] lg:items-center">
          <div>
            <SecurityBadge
              className={joinClassNames('mb-6', badgeAccentClasses.green)}
            >
              <Shield className="mr-1.5 h-3.5 w-3.5" />
              Security Hall of Fame
            </SecurityBadge>

            <h1 className="max-w-5xl font-bold text-4xl tracking-tight sm:text-5xl lg:text-6xl xl:text-7xl">
              Thank you to the{' '}
              <span className="bg-linear-to-r from-dynamic-green via-dynamic-cyan to-dynamic-orange bg-clip-text text-transparent">
                people who make Tuturuuu safer
              </span>
            </h1>

            <p className="mt-6 max-w-3xl text-foreground/70 text-lg leading-relaxed sm:text-xl">
              Meet the researchers who report issues responsibly and help keep
              Tuturuuu trustworthy for teams, schools, and communities.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <SecurityLinkButton href="mailto:security@tuturuuu.com">
                <Mail className="mr-2 h-5 w-5" />
                Report a vulnerability
              </SecurityLinkButton>
              <SecurityLinkButton href="/security/policy" variant="outline">
                <FileText className="mr-2 h-5 w-5" />
                Read security policy
              </SecurityLinkButton>
            </div>
          </div>

          <SecurityCard className="border-dynamic-blue/30 bg-background/80 p-6 shadow-lg backdrop-blur">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-medium text-dynamic-blue text-sm uppercase tracking-wider">
                  Community
                </p>
                <h2 className="mt-3 font-semibold text-2xl">
                  Security improves when researchers can work with us
                </h2>
                <p className="mt-3 text-foreground/60 text-sm leading-relaxed">
                  Every name here reflects careful private reporting and
                  confirmed security value.
                </p>
              </div>
              <Trophy className="h-10 w-10 shrink-0 text-dynamic-yellow" />
            </div>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <LedgerMetric label="Verified reports" value="2" />
              <LedgerMetric label="Recognition" value="Public credit" />
              <LedgerMetric
                className="sm:col-span-2"
                label="Private reporting"
                value="security@tuturuuu.com"
              />
            </div>
          </SecurityCard>
        </div>
      </section>

      <section className="px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <SecurityBadge
                className={joinClassNames('mb-4', badgeAccentClasses.yellow)}
              >
                <Users className="mr-1.5 h-3.5 w-3.5" />
                Hall of Fame
              </SecurityBadge>
              <h2 className="font-semibold text-3xl sm:text-4xl">
                Researchers helping make Tuturuuu safer
              </h2>
            </div>
            <p className="max-w-xl text-foreground/60 leading-relaxed">
              Verified research, public credit, and a short note on what each
              report helped improve.
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
                Found something?
              </h2>
              <p className="mt-4 text-foreground/70 leading-relaxed">
                If you find something, send it privately. We will validate it,
                fix what matters, and credit verified reports when researchers
                want to be listed.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <SecurityLinkButton href="mailto:security@tuturuuu.com">
                  <Mail className="mr-2 h-5 w-5" />
                  Email security team
                </SecurityLinkButton>
                <SecurityLinkButton href="/security" variant="outline">
                  <Shield className="mr-2 h-5 w-5" />
                  Security page
                  <ArrowRight className="ml-2 h-5 w-5" />
                </SecurityLinkButton>
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
