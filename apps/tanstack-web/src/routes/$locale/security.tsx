import {
  createFileRoute,
  Outlet,
  useRouterState,
} from '@tanstack/react-router';
import {
  AlertTriangle,
  ArrowRight,
  Bug,
  Eye,
  FileText,
  Fingerprint,
  Globe2,
  Key,
  type LucideIcon,
  Mail,
  Server,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Trophy,
  UserCheck,
  Users,
} from '@tuturuuu/icons/lucide';
import {
  joinClassNames,
  SecurityBadge,
  SecurityCard,
  SecurityLinkButton,
  type SecurityTone,
  toneClasses,
} from '../../components/security/security-page-primitives';
import { createPageHead } from '../../lib/platform/head';

export const Route = createFileRoute('/$locale/security')({
  component: SecurityRoute,
  head: () =>
    createPageHead({
      description:
        'Read about the Tuturuuu approach to security, compliance, and data protection.',
      title: 'Security at Tuturuuu',
    }),
});

const securityChildRouteIds = new Set([
  '/$locale/security/bug-bounty',
  '/$locale/security/policy',
]);

function SecurityRoute() {
  const hasChildMatch = useRouterState({
    select: (state) =>
      state.matches.some((match) => securityChildRouteIds.has(match.routeId)),
  });

  return hasChildMatch ? <Outlet /> : <SecurityPage />;
}

interface SecurityFeature {
  color: SecurityTone;
  description: string;
  icon: LucideIcon;
  title: string;
}

const securityFeatures: SecurityFeature[] = [
  {
    color: 'blue',
    description:
      'All sensitive data is encrypted in transit and at rest using industry-standard encryption protocols.',
    icon: Shield,
    title: 'End-to-End Encryption',
  },
  {
    color: 'green',
    description:
      'Continuous security assessments and penetration testing to identify and address potential vulnerabilities.',
    icon: ShieldCheck,
    title: 'Regular Security Audits',
  },
  {
    color: 'purple',
    description:
      'Role-based access control (RBAC) and multi-factor authentication (MFA) to ensure secure access.',
    icon: UserCheck,
    title: 'Access Control',
  },
  {
    color: 'cyan',
    description:
      'Strict data privacy controls and compliance with global privacy regulations and standards.',
    icon: Fingerprint,
    title: 'Data Privacy',
  },
  {
    color: 'orange',
    description:
      'Secure key management system with regular rotation and strict access policies.',
    icon: Key,
    title: 'Key Management',
  },
  {
    color: 'pink',
    description:
      'Secure cloud infrastructure with multiple layers of protection and redundancy.',
    icon: Server,
    title: 'Infrastructure Security',
  },
  {
    color: 'yellow',
    description:
      '24/7 security monitoring and comprehensive logging of all system activities.',
    icon: Eye,
    title: 'Monitoring & Logging',
  },
  {
    color: 'red',
    description:
      'Active bug bounty program to encourage responsible disclosure of security vulnerabilities.',
    icon: Bug,
    title: 'Bug Bounty Program',
  },
];

const reportingGuidelines = [
  {
    cardClass: 'border-dynamic-orange/30 bg-dynamic-orange/5',
    description: 'Security issues in our core services and infrastructure',
    icon: AlertTriangle,
    iconClass: 'text-dynamic-orange',
    iconFrameClass: 'bg-dynamic-orange/10',
    title: 'Scope',
  },
  {
    cardClass: 'border-dynamic-blue/30 bg-dynamic-blue/5',
    description: 'Email security@tuturuuu.com with detailed reports',
    icon: Mail,
    iconClass: 'text-dynamic-blue',
    iconFrameClass: 'bg-dynamic-blue/10',
    title: 'Contact',
  },
  {
    cardClass: 'border-dynamic-green/30 bg-dynamic-green/5',
    description: "We'll respond within 24 hours to acknowledge reports",
    icon: Shield,
    iconClass: 'text-dynamic-green',
    iconFrameClass: 'bg-dynamic-green/10',
    title: 'Response',
  },
];

const trustIndicators: SecurityFeature[] = [
  {
    color: 'green',
    description:
      'We work with security researchers to responsibly disclose vulnerabilities',
    icon: ShieldCheck,
    title: 'Responsible Disclosure',
  },
  {
    color: 'blue',
    description:
      'Active program rewarding ethical hackers for finding security issues',
    icon: Globe2,
    title: 'Bug Bounty Program',
  },
  {
    color: 'purple',
    description:
      'Regular security updates and clear documentation of our practices',
    icon: FileText,
    title: 'Transparent Communication',
  },
];

export default function SecurityPage() {
  return (
    <main className="relative mx-auto w-full overflow-x-hidden text-balance">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute top-0 -left-32 h-96 w-96 rounded-full bg-linear-to-br from-dynamic-purple/40 via-dynamic-pink/30 to-transparent blur-3xl sm:-left-64 sm:h-[40rem] sm:w-[40rem]" />
        <div className="absolute top-[40%] -right-32 h-80 w-80 rounded-full bg-linear-to-br from-dynamic-blue/40 via-dynamic-cyan/30 to-transparent blur-3xl sm:-right-64 sm:h-[35rem] sm:w-[35rem]" />
        <div className="absolute -bottom-32 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-linear-to-br from-dynamic-green/30 via-dynamic-emerald/20 to-transparent blur-3xl sm:-bottom-64 sm:h-[45rem] sm:w-[45rem]" />
      </div>

      <div className="pointer-events-none fixed inset-0 -z-10 opacity-30">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(var(--primary-rgb),0.08)_1px,transparent_1px)] bg-[size:32px_32px]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(var(--primary-rgb),0.04)_1px,transparent_1px)] bg-[size:120px]" />
      </div>

      <section className="relative px-4 pt-24 pb-16 sm:px-6 sm:pt-32 sm:pb-20 lg:px-8 lg:pt-40 lg:pb-24">
        <div className="mx-auto max-w-7xl text-center">
          <SecurityBadge className="mb-6 border-dynamic-blue/30 bg-dynamic-blue/10 text-dynamic-blue transition-all hover:scale-105 hover:bg-dynamic-blue/20 hover:shadow-dynamic-blue/20 hover:shadow-lg">
            <Shield className="mr-1.5 h-3.5 w-3.5" />
            Security First
          </SecurityBadge>

          <h1 className="mb-6 text-balance font-bold text-4xl tracking-tight sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl">
            Every layer,{' '}
            <span className="animate-gradient bg-linear-to-r from-dynamic-blue via-dynamic-cyan to-dynamic-green bg-clip-text text-transparent">
              secured
            </span>
          </h1>

          <p className="mx-auto mb-12 max-w-3xl text-balance text-base text-foreground/70 leading-relaxed sm:text-lg md:text-xl lg:text-2xl">
            We are committed to protecting your data with industry-leading
            security practices, continuous monitoring, and transparent
            communication.
          </p>
        </div>
      </section>

      <section className="relative px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-16 text-center">
            <h2 className="mb-4 font-bold text-4xl sm:text-5xl">
              Built on{' '}
              <span className="bg-linear-to-r from-dynamic-purple via-dynamic-pink to-dynamic-orange bg-clip-text text-transparent">
                Security
              </span>
            </h2>
            <p className="mx-auto max-w-2xl text-foreground/60 text-lg">
              Multiple layers of protection to keep your data safe and secure
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {securityFeatures.map((feature) => {
              const Icon = feature.icon;
              const styles = toneClasses[feature.color];

              return (
                <SecurityCard
                  className={joinClassNames(
                    'group h-full p-6 transition-all hover:shadow-lg',
                    styles.card
                  )}
                  key={feature.title}
                >
                  <div
                    className={joinClassNames(
                      'mb-4 flex h-12 w-12 items-center justify-center rounded-xl transition-transform group-hover:rotate-12 group-hover:scale-110',
                      styles.iconFrame
                    )}
                  >
                    <Icon className={joinClassNames('h-6 w-6', styles.icon)} />
                  </div>
                  <h3 className="mb-2 font-semibold text-lg">
                    {feature.title}
                  </h3>
                  <p className="text-foreground/60 text-sm leading-relaxed">
                    {feature.description}
                  </p>
                </SecurityCard>
              );
            })}
          </div>
        </div>
      </section>

      <section className="relative px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <SecurityCard className="overflow-hidden border-dynamic-red/30 bg-linear-to-br from-dynamic-red/5 via-background to-background p-8 md:p-12">
            <div className="grid gap-12 lg:grid-cols-2">
              <div className="flex flex-col justify-center">
                <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-dynamic-red/10">
                  <ShieldAlert className="h-10 w-10 text-dynamic-red" />
                </div>

                <h2 className="mb-4 font-bold text-3xl sm:text-4xl">
                  <span className="bg-linear-to-r from-dynamic-red via-dynamic-orange to-dynamic-yellow bg-clip-text text-transparent">
                    Report a Vulnerability
                  </span>
                </h2>
                <p className="mb-8 text-foreground/70 text-lg leading-relaxed">
                  Found a security vulnerability? We appreciate your help in
                  disclosing it responsibly. Please contact our security team
                  directly.
                </p>

                <div className="mb-8 flex flex-col flex-wrap gap-3 sm:flex-row sm:gap-4">
                  <SecurityLinkButton href="mailto:security@tuturuuu.com">
                    <Mail className="mr-2 h-5 w-5" />
                    Contact Security Team
                  </SecurityLinkButton>
                  <SecurityLinkButton href="/security/policy" variant="outline">
                    <FileText className="mr-2 h-5 w-5" />
                    Security Policy
                  </SecurityLinkButton>
                </div>

                <div className="flex flex-wrap gap-6">
                  <a
                    className="group flex items-center gap-2 text-foreground/60 transition-colors hover:text-foreground"
                    href="/security/bug-bounty"
                  >
                    <Trophy className="h-5 w-5 text-dynamic-yellow" />
                    <span>Bug Bounty Hall of Fame</span>
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </a>
                  <a
                    className="group flex items-center gap-2 text-foreground/60 transition-colors hover:text-foreground"
                    href="/contributors"
                  >
                    <Users className="h-5 w-5 text-dynamic-purple" />
                    <span>Contributors</span>
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </a>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="mb-6 font-bold text-2xl">
                  Reporting Guidelines
                </h3>

                {reportingGuidelines.map((guideline) => {
                  const Icon = guideline.icon;

                  return (
                    <SecurityCard
                      className={joinClassNames('p-6', guideline.cardClass)}
                      key={guideline.title}
                    >
                      <div className="mb-3 flex items-center gap-3">
                        <div
                          className={joinClassNames(
                            'flex h-10 w-10 items-center justify-center rounded-full',
                            guideline.iconFrameClass
                          )}
                        >
                          <Icon
                            className={joinClassNames(
                              'h-5 w-5',
                              guideline.iconClass
                            )}
                          />
                        </div>
                        <h4 className="font-semibold text-lg">
                          {guideline.title}
                        </h4>
                      </div>
                      <p className="text-foreground/70 text-sm leading-relaxed">
                        {guideline.description}
                      </p>
                    </SecurityCard>
                  );
                })}
              </div>
            </div>
          </SecurityCard>
        </div>
      </section>

      <section className="relative px-4 py-24 pb-32 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-16 text-center">
            <h2 className="mb-4 font-bold text-4xl sm:text-5xl">
              Trusted{' '}
              <span className="bg-linear-to-r from-dynamic-green via-dynamic-cyan to-dynamic-blue bg-clip-text text-transparent">
                Globally
              </span>
            </h2>
            <p className="mx-auto max-w-2xl text-foreground/60 text-lg">
              Our commitment to security and transparency
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-3">
            {trustIndicators.map((item) => {
              const Icon = item.icon;
              const styles = toneClasses[item.color];

              return (
                <SecurityCard
                  className={joinClassNames(
                    'h-full p-8 text-center transition-all hover:shadow-lg',
                    styles.card
                  )}
                  key={item.title}
                >
                  <div
                    className={joinClassNames(
                      'mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl',
                      styles.iconFrame
                    )}
                  >
                    <Icon className={joinClassNames('h-8 w-8', styles.icon)} />
                  </div>
                  <h3 className="mb-3 font-bold text-xl">{item.title}</h3>
                  <p className="text-foreground/60 text-sm leading-relaxed">
                    {item.description}
                  </p>
                </SecurityCard>
              );
            })}
          </div>
        </div>
      </section>
    </main>
  );
}
