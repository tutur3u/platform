import {
  ArrowRight,
  Check,
  GithubIcon,
  Mail,
  Sparkles,
} from '@tuturuuu/icons/lucide';
import { cn } from '@tuturuuu/utils/format';
import {
  Reveal,
  RevealGroup,
  RevealItem,
} from '@/components/landing/shared/reveal';
import { Panel, SectionShell } from '@/components/landing/shared/section-shell';
import { SurfaceCard } from '@/components/landing/shared/surface-card';
import { ActionLink } from '@/components/marketing/action-link';
import { PageHero } from '@/components/marketing/page-hero';
import {
  aiSystems,
  benefits,
  culture,
  roles,
  techStack,
  values,
} from './careers-data';
import { RoleCard } from './role-card';

export function CareersHero() {
  return (
    <PageHero
      accent="purple"
      actions={
        <>
          <ActionLink href="#roles">
            View open roles
            <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
          </ActionLink>
          <ActionLink href="mailto:contact@tuturuuu.com" variant="ghost">
            <Mail className="h-4 w-4" />
            Get in touch
          </ActionLink>
          <ActionLink
            external
            href="https://github.com/tutur3u/platform"
            variant="quiet"
          >
            <GithubIcon className="h-4 w-4" />
            See the work
          </ActionLink>
        </>
      }
      description="We are building Mira, a proactive assistant for modern life, and the eighteen-app workspace it lives in. Not productivity tools — an intelligent partner that removes digital friction."
      eyebrow="Careers"
      eyebrowIcon={Sparkles}
      highlight="human potential"
      title="Build the future of"
    />
  );
}

export function ValuesSection() {
  return (
    <SectionShell
      bloom="purple"
      eyebrow="What we believe"
      index="01"
      subtitle="Six positions we keep returning to when a decision is hard."
      title="The arguments we start from"
      width="wide"
    >
      <RevealGroup
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        stagger={0.05}
      >
        {values.map((value) => (
          <RevealItem className="h-full" key={value.title}>
            <SurfaceCard
              accent={value.accent}
              description={value.description}
              icon={value.icon}
              title={value.title}
            />
          </RevealItem>
        ))}
      </RevealGroup>
    </SectionShell>
  );
}

export function CultureSection() {
  return (
    <SectionShell
      bloom="green"
      eyebrow="How we work"
      index="02"
      subtitle="Beliefs are cheap. This is what they cost us in practice."
      title="The habits underneath"
      width="wide"
    >
      <RevealGroup
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        stagger={0.05}
      >
        {culture.map((item) => (
          <RevealItem className="h-full" key={item.title}>
            <SurfaceCard
              accent={item.accent}
              description={item.description}
              icon={item.icon}
              title={item.title}
            />
          </RevealItem>
        ))}
      </RevealGroup>
    </SectionShell>
  );
}

export function SystemsSection() {
  return (
    <SectionShell
      bloom="blue"
      eyebrow="What you would work on"
      index="03"
      subtitle="Five AI systems and the suite they run underneath."
      title="The things being built"
      width="wide"
    >
      <RevealGroup
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        stagger={0.05}
      >
        {aiSystems.map((system) => (
          <RevealItem className="h-full" key={system.name}>
            <SurfaceCard
              accent={system.accent}
              description={
                <>
                  {system.description}
                  <span className="mt-3 flex flex-wrap gap-1.5">
                    {system.features.map((feature) => (
                      <span
                        className="rounded-full border border-foreground/10 bg-foreground/[0.03] px-2 py-0.5 font-mono-ui text-[0.55rem] text-foreground/45 uppercase tracking-[0.12em]"
                        key={feature}
                      >
                        {feature}
                      </span>
                    ))}
                  </span>
                </>
              }
              eyebrow={system.subtitle}
              icon={system.icon}
              title={system.name}
            />
          </RevealItem>
        ))}
      </RevealGroup>
    </SectionShell>
  );
}

export function RolesSection() {
  return (
    <SectionShell
      bloom="cyan"
      eyebrow="Open roles"
      id="roles"
      index="04"
      subtitle="We hire for the shape of the problem, not a headcount plan. If your area is here and the work fits, write to us."
      title="Where we need people"
      width="wide"
    >
      <RevealGroup className="grid gap-3 lg:grid-cols-2" stagger={0.08}>
        {roles.map((role) => (
          <RevealItem className="h-full" key={role.area}>
            <RoleCard role={role} />
          </RevealItem>
        ))}
      </RevealGroup>
    </SectionShell>
  );
}

export function BenefitsSection() {
  return (
    <SectionShell
      bloom="orange"
      eyebrow="What you get"
      index="05"
      subtitle="The stack you would work in, and the terms you would work under."
      title="Tools and terms"
      width="wide"
    >
      <RevealGroup
        className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        stagger={0.05}
      >
        {techStack.map((stack) => (
          <RevealItem className="h-full" key={stack.category}>
            <SurfaceCard
              accent={stack.accent}
              description={
                <span className="mt-1 flex flex-wrap gap-1.5">
                  {stack.technologies.map((tech) => (
                    <span
                      className="rounded-full border border-foreground/10 bg-foreground/[0.03] px-2 py-0.5 font-mono-ui text-[0.58rem] text-foreground/50"
                      key={tech}
                    >
                      {tech}
                    </span>
                  ))}
                </span>
              }
              icon={stack.icon}
              title={stack.category}
            />
          </RevealItem>
        ))}
      </RevealGroup>

      <Reveal delay={0.1}>
        <Panel className="grid gap-x-8 gap-y-6 p-6 sm:grid-cols-2 sm:p-8 lg:grid-cols-3">
          {benefits.map((benefit) => (
            <div className="flex items-start gap-3" key={benefit.title}>
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-foreground/10 bg-foreground/[0.03]">
                <benefit.icon className="h-3.5 w-3.5 text-foreground/60" />
              </span>
              <div className="min-w-0">
                <h3 className="font-display font-semibold text-[0.95rem] tracking-[-0.01em]">
                  {benefit.title}
                </h3>
                <p className="mt-1 text-foreground/45 text-xs leading-relaxed">
                  {benefit.description}
                </p>
              </div>
            </div>
          ))}
        </Panel>
      </Reveal>
    </SectionShell>
  );
}

const closingPoints = [
  'Tell us what you have built, not where you studied',
  'A link beats a CV',
  'We reply to everyone',
];

export function CareersClosing() {
  return (
    <SectionShell
      bloom="purple"
      eyebrow="Apply"
      index="06"
      subtitle="No portal, no tracking number. An email to a person who reads it."
      title="How to reach us"
    >
      <Reveal>
        <Panel className="flex flex-col items-center px-6 py-12 text-center sm:px-12 sm:py-16">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-dynamic-purple/25 bg-dynamic-purple/10">
            <Mail className="h-6 w-6 text-dynamic-purple" />
          </span>

          <h3 className="mt-6 max-w-lg text-balance font-display font-semibold text-2xl tracking-[-0.02em] sm:text-3xl">
            contact@tuturuuu.com
          </h3>

          <ul className="mt-6 grid gap-2">
            {closingPoints.map((point) => (
              <li
                className={cn(
                  'flex items-center justify-center gap-2 text-foreground/50 text-sm'
                )}
                key={point}
              >
                <Check className="h-3.5 w-3.5 shrink-0 text-dynamic-green/70" />
                {point}
              </li>
            ))}
          </ul>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <ActionLink href="mailto:contact@tuturuuu.com">
              Write to us
              <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
            </ActionLink>
            <ActionLink href="/about" variant="ghost">
              Read the long version
            </ActionLink>
          </div>
        </Panel>
      </Reveal>
    </SectionShell>
  );
}
