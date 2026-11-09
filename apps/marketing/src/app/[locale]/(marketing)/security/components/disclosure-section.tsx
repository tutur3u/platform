import {
  ArrowRight,
  FileText,
  Mail,
  ShieldAlert,
  Trophy,
  Users,
} from '@tuturuuu/icons/lucide';
import { Reveal } from '@/components/landing/shared/reveal';
import { Panel, SectionShell } from '@/components/landing/shared/section-shell';
import { ActionLink } from '@/components/marketing/action-link';

/** What happens after you send the email, as a numbered path. */
const steps = [
  {
    title: 'Scope',
    body: 'Security issues in our core services and infrastructure.',
    tone: 'text-dynamic-orange',
    rule: 'bg-dynamic-orange/40',
  },
  {
    title: 'Contact',
    body: 'Email security@tuturuuu.com with a detailed report.',
    tone: 'text-dynamic-blue',
    rule: 'bg-dynamic-blue/40',
  },
  {
    title: 'Response',
    body: 'We acknowledge reports within 24 hours.',
    tone: 'text-dynamic-green',
    rule: 'bg-dynamic-green/40',
  },
];

const related = [
  {
    href: '/security/bug-bounty',
    icon: Trophy,
    label: 'Bug bounty hall of fame',
    tone: 'text-dynamic-yellow',
  },
  {
    href: '/contributors',
    icon: Users,
    label: 'Contributors',
    tone: 'text-dynamic-purple',
  },
];

export function DisclosureSection() {
  return (
    <SectionShell
      bloom="red"
      eyebrow="Disclosure"
      id="report"
      index="02"
      subtitle="Found something? Tell us, and here is exactly what happens next."
      title="Report a vulnerability"
    >
      <Reveal>
        <Panel className="grid gap-10 p-6 sm:p-9 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12">
          <div className="flex flex-col justify-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-dynamic-red/25 bg-dynamic-red/10">
              <ShieldAlert className="h-6 w-6 text-dynamic-red" />
            </span>

            <h3 className="mt-6 text-balance font-display font-semibold text-2xl tracking-[-0.02em] sm:text-3xl">
              Responsible disclosure, taken seriously
            </h3>
            <p className="mt-4 max-w-md text-foreground/55 leading-relaxed">
              We would rather hear it from you than from an incident. Reports go
              straight to the security team, and we will keep you in the loop
              while we fix it.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <ActionLink href="mailto:security@tuturuuu.com">
                <Mail className="h-4 w-4" />
                Contact security
              </ActionLink>
              <ActionLink href="/security/policy" variant="ghost">
                <FileText className="h-4 w-4" />
                Read the policy
              </ActionLink>
            </div>

            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 border-foreground/[0.07] border-t pt-6">
              {related.map((link) => (
                <a
                  className="group flex items-center gap-2 text-foreground/50 text-sm transition-colors hover:text-foreground"
                  href={link.href}
                  key={link.href}
                >
                  <link.icon className={`h-4 w-4 ${link.tone}`} />
                  {link.label}
                  <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5" />
                </a>
              ))}
            </div>
          </div>

          {/* The path a report takes, as an ordered rail */}
          <ol className="relative flex flex-col gap-6 border-foreground/[0.07] border-l pl-6">
            {steps.map((step, index) => (
              <li className="relative" key={step.title}>
                <span
                  aria-hidden
                  className={`absolute top-1.5 -left-[1.6rem] h-1.5 w-1.5 rounded-full ${step.rule}`}
                />
                <span
                  className={`font-mono-ui text-[0.6rem] tabular-nums tracking-[0.2em] ${step.tone}`}
                >
                  {`0${index + 1}`}
                </span>
                <h4 className="mt-1.5 font-display font-semibold text-lg tracking-[-0.01em]">
                  {step.title}
                </h4>
                <p className="mt-1.5 text-foreground/50 text-sm leading-relaxed">
                  {step.body}
                </p>
              </li>
            ))}
          </ol>
        </Panel>
      </Reveal>
    </SectionShell>
  );
}
