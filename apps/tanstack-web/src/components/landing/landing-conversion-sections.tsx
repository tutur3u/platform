import {
  ArrowRight,
  CheckCircle2,
  MessageSquare,
  Sparkles,
  TrendingUp,
} from '@tuturuuu/icons/lucide';
import type { LandingContent } from './landing-content';
import {
  ActionLink,
  SectionHeader,
  SectionShell,
  SurfaceCard,
} from './landing-primitives';

export function AiSection({
  content,
}: Readonly<{ content: LandingContent['ai'] }>) {
  return (
    <SectionShell>
      <div className="grid items-center gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <span className="mb-4 inline-flex items-center gap-2 rounded-full border border-dynamic-purple/20 bg-dynamic-purple/5 px-3 py-1.5 font-medium text-dynamic-purple text-xs">
            <Sparkles className="h-3.5 w-3.5" />
            {content.title}
          </span>
          <h2 className="font-bold text-3xl tracking-normal sm:text-4xl">
            {content.mira.title}
          </h2>
          <p className="mt-4 text-foreground/60 text-lg">
            {content.mira.description}
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {content.mira.capabilities.map((capability) => (
              <span
                className="rounded-full border border-foreground/10 bg-foreground/[0.03] px-3 py-1 text-foreground/65 text-sm"
                key={capability}
              >
                {capability}
              </span>
            ))}
          </div>
        </div>

        <SurfaceCard className="relative overflow-hidden">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-dynamic-purple/10 text-dynamic-purple">
              <MessageSquare className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold">{content.mira.title}</h3>
              <p className="text-foreground/55 text-sm">{content.subtitle}</p>
            </div>
          </div>
          <div className="space-y-3">
            {content.mira.prompts.map((prompt) => (
              <div
                className="rounded-lg border border-foreground/10 bg-foreground/[0.02] p-3 text-sm"
                key={prompt}
              >
                {prompt}
              </div>
            ))}
          </div>
        </SurfaceCard>
      </div>
    </SectionShell>
  );
}

export function PricingSection({
  content,
}: Readonly<{ content: LandingContent['pricing'] }>) {
  return (
    <SectionShell id="pricing">
      <SectionHeader subtitle={content.subtitle} title={content.title} />
      <div className="grid gap-4 lg:grid-cols-3">
        {content.tiers.map((tier) => (
          <SurfaceCard
            className="flex h-full flex-col border-foreground/10"
            key={tier.name}
          >
            <div className="flex min-h-8 items-center justify-between gap-3">
              <h3 className="font-semibold text-xl">{tier.name}</h3>
              {tier.badge ? (
                <span className="rounded-full bg-dynamic-purple/10 px-2.5 py-1 font-medium text-dynamic-purple text-xs">
                  {tier.badge}
                </span>
              ) : null}
            </div>
            <p className="mt-2 min-h-10 text-foreground/60 text-sm">
              {tier.description}
            </p>
            <div className="mt-5 flex items-end gap-2">
              <span className="font-bold text-4xl">{tier.price}</span>
              {tier.period ? (
                <span className="pb-1 text-foreground/50 text-sm">
                  {tier.period}
                </span>
              ) : null}
            </div>
            <div className="mt-5 flex-1 space-y-2">
              {tier.features.map((feature) => (
                <div className="flex gap-2 text-sm" key={feature}>
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-dynamic-green" />
                  <span>{feature}</span>
                </div>
              ))}
            </div>
            <ActionLink className="mt-6 w-full" href="/onboarding">
              {tier.cta}
            </ActionLink>
          </SurfaceCard>
        ))}
      </div>
    </SectionShell>
  );
}

export function SocialProofSection({
  content,
}: Readonly<{ content: LandingContent['socialProof'] }>) {
  return (
    <SectionShell className="py-12 sm:py-16">
      <SurfaceCard className="grid items-center gap-6 md:grid-cols-[1fr_1.2fr]">
        <div>
          <p className="font-medium text-dynamic-cyan text-sm">
            {content.backedBy}
          </p>
          <h2 className="mt-2 font-bold text-3xl tracking-normal">
            {content.title}
          </h2>
          <ActionLink
            className="mt-5"
            href="https://github.com/tutur3u/tuturuuu"
          >
            {content.cta}
            <ArrowRight className="h-4 w-4" />
          </ActionLink>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {content.stats.map((stat) => (
            <div
              className="rounded-lg border border-foreground/10 bg-foreground/[0.02] p-4"
              key={stat.label}
            >
              <div className="font-bold text-3xl text-dynamic-blue">
                {stat.value}
              </div>
              <div className="mt-1 text-foreground/55 text-sm">
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </SurfaceCard>
    </SectionShell>
  );
}

export function CtaSection({
  content,
}: Readonly<{ content: LandingContent['cta'] }>) {
  return (
    <SectionShell>
      <div className="mx-auto max-w-4xl text-center">
        <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-dynamic-purple/10 text-dynamic-purple">
          <TrendingUp className="h-6 w-6" />
        </div>
        <h2 className="font-bold text-3xl tracking-normal sm:text-4xl">
          {content.title}
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-foreground/60 text-lg">
          {content.description}
        </p>
        <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <ActionLink href="/onboarding">
            {content.primary}
            <ArrowRight className="h-4 w-4" />
          </ActionLink>
          <ActionLink href="/contact" variant="secondary">
            {content.secondary}
          </ActionLink>
        </div>
        <p className="mt-4 text-foreground/50 text-sm">{content.note}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3 text-foreground/55 text-sm">
          {content.trust.map((item) => (
            <span className="inline-flex items-center gap-2" key={item}>
              <CheckCircle2 className="h-4 w-4 text-dynamic-green" />
              {item}
            </span>
          ))}
        </div>
      </div>
    </SectionShell>
  );
}
