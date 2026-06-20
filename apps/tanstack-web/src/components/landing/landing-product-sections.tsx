import type { LucideIcon } from '@tuturuuu/icons/lucide';
import {
  Calendar,
  CheckCircle2,
  GraduationCap,
  MessageSquare,
  Users,
  Wallet,
} from '@tuturuuu/icons/lucide';
import {
  type FeatureKey,
  type LandingContent,
  landingFeatureOrder,
} from './landing-content';
import {
  joinClassNames,
  SectionHeader,
  SectionShell,
  SurfaceCard,
} from './landing-primitives';

const featureConfig: Record<
  FeatureKey,
  { color: string; icon: LucideIcon; iconBg: string }
> = {
  nova: {
    color: 'text-dynamic-orange',
    icon: GraduationCap,
    iconBg: 'bg-dynamic-orange/10',
  },
  tuchat: {
    color: 'text-dynamic-cyan',
    icon: MessageSquare,
    iconBg: 'bg-dynamic-cyan/10',
  },
  tudo: {
    color: 'text-dynamic-green',
    icon: CheckCircle2,
    iconBg: 'bg-dynamic-green/10',
  },
  tufinance: {
    color: 'text-dynamic-green',
    icon: Wallet,
    iconBg: 'bg-dynamic-green/10',
  },
  tumeet: {
    color: 'text-dynamic-purple',
    icon: Users,
    iconBg: 'bg-dynamic-purple/10',
  },
  tuplan: {
    color: 'text-dynamic-blue',
    icon: Calendar,
    iconBg: 'bg-dynamic-blue/10',
  },
};

export function ProblemSection({
  content,
}: Readonly<{ content: LandingContent['problem'] }>) {
  return (
    <SectionShell className="py-12 sm:py-16">
      <SurfaceCard className="grid items-center gap-6 md:grid-cols-[1fr_1.1fr]">
        <div>
          <h2 className="font-bold text-3xl tracking-normal">
            {content.title}
          </h2>
          <p className="mt-3 text-foreground/60 text-lg">{content.subtitle}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {content.stats.map((stat) => (
            <div
              className="rounded-lg border border-foreground/10 bg-foreground/[0.02] p-4 text-center"
              key={stat.label}
            >
              <div className="font-bold text-3xl text-dynamic-purple">
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

export function FeaturesSection({
  content,
}: Readonly<{ content: LandingContent['features'] }>) {
  return (
    <SectionShell id="features">
      <SectionHeader subtitle={content.subtitle} title={content.title} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {landingFeatureOrder.map((key) => {
          const product = content.apps[key];
          const config = featureConfig[key];
          const Icon = config.icon;

          return (
            <SurfaceCard
              className="group h-full transition-shadow hover:shadow-lg"
              key={key}
            >
              <div
                className={joinClassNames(
                  'mb-4 flex h-11 w-11 items-center justify-center rounded-lg transition-transform group-hover:scale-105',
                  config.iconBg
                )}
              >
                <Icon className={joinClassNames('h-5 w-5', config.color)} />
              </div>
              <h3 className="font-semibold text-lg">{product.title}</h3>
              <p className={joinClassNames('mt-1 text-sm', config.color)}>
                {product.subtitle}
              </p>
              <p className="mt-3 text-foreground/60 text-sm leading-relaxed">
                {product.description}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {product.highlights.map((highlight) => (
                  <span
                    className="rounded-full border border-foreground/10 bg-foreground/[0.03] px-2.5 py-1 text-foreground/60 text-xs"
                    key={highlight}
                  >
                    {highlight}
                  </span>
                ))}
              </div>
            </SurfaceCard>
          );
        })}
      </div>
    </SectionShell>
  );
}

export function DemoSection({
  content,
}: Readonly<{ content: LandingContent['demo'] }>) {
  return (
    <SectionShell>
      <SectionHeader
        eyebrow={content.badge}
        highlight={content.title.highlight}
        subtitle={content.subtitle}
        title={content.title.part1}
      />
      <div className="grid gap-4 lg:grid-cols-3">
        {content.panels.map((panel, index) => (
          <SurfaceCard className="flex h-full flex-col" key={panel.title}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <span className="rounded-full bg-foreground/[0.04] px-3 py-1 font-medium text-foreground/60 text-xs">
                0{index + 1}
              </span>
              <span className="font-medium text-dynamic-blue text-xs">
                {panel.cta}
              </span>
            </div>
            <h3 className="font-semibold text-xl">{panel.title}</h3>
            <p className="mt-2 text-foreground/60 text-sm">{panel.subtitle}</p>
            <div className="mt-5 space-y-2">
              {panel.details.map((detail) => (
                <div
                  className="flex items-center gap-2 rounded-md border border-foreground/10 bg-foreground/[0.02] px-3 py-2 text-sm"
                  key={detail}
                >
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-dynamic-green" />
                  <span className="truncate">{detail}</span>
                </div>
              ))}
            </div>
          </SurfaceCard>
        ))}
      </div>
    </SectionShell>
  );
}
