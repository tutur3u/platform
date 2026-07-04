import { Star } from '@tuturuuu/icons/lucide';
import type { ReactNode } from 'react';

type SolutionCardItem = {
  description: string;
  icon: ReactNode;
  title: string;
};

type SolutionMetric = {
  label: string;
  value: string;
};

type SolutionFaq = {
  answer: string;
  question: string;
};

export type SolutionPageConfig = {
  badge: string;
  benefits: SolutionCardItem[];
  coreFeatures: SolutionCardItem[];
  cta: {
    description: string;
    title: string;
  };
  description: string;
  features: SolutionCardItem[];
  featuresTitle: string;
  primaryBenefit: SolutionCardItem;
  story: {
    author: string;
    icon?: ReactNode;
    quote: string;
    role: string;
    metrics: SolutionMetric[];
  };
  coreFeaturesTitle?: string;
  title: string;
  trust: SolutionCardItem;
  faqs: SolutionFaq[];
};

const joinClassNames = (...classNames: (string | undefined)[]) =>
  classNames.filter(Boolean).join(' ');

function SolutionBadge({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <span className="inline-flex w-fit shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-md border border-transparent bg-secondary px-2 py-0.5 font-semibold text-secondary-foreground text-xs transition-[color,box-shadow]">
      {children}
    </span>
  );
}

function SolutionCard({
  children,
  className,
}: Readonly<{ children: ReactNode; className?: string }>) {
  return (
    <div
      className={joinClassNames(
        'rounded-lg border bg-card text-card-foreground shadow-sm',
        className
      )}
    >
      {children}
    </div>
  );
}

function SolutionLinkButton({
  children,
  href,
  variant = 'default',
}: Readonly<{
  children: ReactNode;
  href: string;
  variant?: 'default' | 'outline';
}>) {
  return (
    <a
      className={joinClassNames(
        'inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-md px-8 font-medium text-sm shadow-sm transition-[color,box-shadow]',
        variant === 'outline'
          ? 'border border-input bg-background hover:bg-accent hover:text-accent-foreground'
          : 'bg-primary text-primary-foreground hover:bg-primary/90'
      )}
      href={href}
    >
      {children}
    </a>
  );
}

function SectionTitle({ children }: Readonly<{ children: ReactNode }>) {
  return <h2 className="mb-12 text-center font-bold text-3xl">{children}</h2>;
}

function ItemCard({ item }: Readonly<{ item: SolutionCardItem }>) {
  return (
    <SolutionCard className="h-full p-6 transition-colors hover:border-primary">
      <div className="mb-4 flex items-center gap-3">
        <div className="text-primary">{item.icon}</div>
        <h3 className="font-semibold text-xl">{item.title}</h3>
      </div>
      <p className="text-muted-foreground">{item.description}</p>
    </SolutionCard>
  );
}

function MiniItemCard({ item }: Readonly<{ item: SolutionCardItem }>) {
  return (
    <SolutionCard className="group overflow-hidden">
      <div className="flex h-full flex-col p-6 transition-transform group-hover:-translate-y-1">
        <div className="mb-2 text-primary">{item.icon}</div>
        <h3 className="mb-2 font-bold">{item.title}</h3>
        <p className="text-muted-foreground text-sm">{item.description}</p>
        <div className="mt-4 h-1 w-0 bg-primary/10 transition-all group-hover:w-full" />
      </div>
    </SolutionCard>
  );
}

function CoreFeatureCard({ item }: Readonly<{ item: SolutionCardItem }>) {
  return (
    <SolutionCard className="p-6 text-center">
      <div className="mx-auto mb-4 flex justify-center text-primary">
        {item.icon}
      </div>
      <h3 className="mb-2 font-bold">{item.title}</h3>
      <p className="text-muted-foreground text-sm">{item.description}</p>
    </SolutionCard>
  );
}

function FaqList({ faqs }: Readonly<{ faqs: SolutionFaq[] }>) {
  const midpoint = Math.ceil(faqs.length / 2);
  const columns = [faqs.slice(0, midpoint), faqs.slice(midpoint)];

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {columns.map((column, columnIndex) => (
        <div className="grid h-fit gap-4" key={`faq-column-${columnIndex + 1}`}>
          {column.map((faq) => (
            <details
              className="rounded-lg border bg-card p-4 text-card-foreground"
              key={faq.question}
            >
              <summary className="cursor-pointer font-medium">
                {faq.question}
              </summary>
              <p className="mt-3 text-muted-foreground text-sm">{faq.answer}</p>
            </details>
          ))}
        </div>
      ))}
    </div>
  );
}

export function SolutionPage({
  config,
}: Readonly<{ config: SolutionPageConfig }>) {
  return (
    <main className="container mx-auto mt-8 flex max-w-6xl flex-col gap-6 px-3 py-16 lg:gap-14 lg:py-24">
      <section className="mb-8 text-center">
        <SolutionBadge>{config.badge}</SolutionBadge>
        <h1 className="mt-4 mb-4 text-balance text-center font-bold text-2xl tracking-tight md:text-4xl lg:text-6xl">
          <span className="bg-linear-to-r from-dynamic-light-red via-dynamic-light-pink to-dynamic-light-blue bg-clip-text py-1 text-transparent">
            {config.title}
          </span>
        </h1>
        <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
          {config.description}
        </p>
        <div className="mt-8 flex flex-col justify-center gap-4 sm:flex-row">
          <SolutionLinkButton href="/contact">Get Started</SolutionLinkButton>
          <SolutionLinkButton href="/pricing" variant="outline">
            View Pricing
          </SolutionLinkButton>
        </div>
      </section>

      <section className="mb-24">
        <SolutionCard className="border-primary bg-primary/5 p-8">
          <div className="mx-auto flex max-w-4xl flex-col items-center gap-4 text-center">
            <div className="text-primary">{config.trust.icon}</div>
            <h2 className="font-bold text-2xl">{config.trust.title}</h2>
            <p className="text-muted-foreground">{config.trust.description}</p>
          </div>
        </SolutionCard>
      </section>

      <section className="mb-24">
        <SectionTitle>{config.featuresTitle}</SectionTitle>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {config.features.map((feature) => (
            <ItemCard item={feature} key={feature.title} />
          ))}
        </div>
      </section>

      <section className="mb-24">
        <SectionTitle>Key Benefits</SectionTitle>
        <div className="grid gap-4 md:grid-cols-4 md:grid-rows-2">
          <SolutionCard className="bg-primary/5 md:col-span-2 md:row-span-2">
            <div className="flex h-full flex-col p-6">
              <div className="mb-4 text-primary">
                {config.primaryBenefit.icon}
              </div>
              <h3 className="mb-2 font-bold text-xl">
                {config.primaryBenefit.title}
              </h3>
              <p className="text-muted-foreground">
                {config.primaryBenefit.description}
              </p>
              <div className="mt-4 grow rounded-lg bg-background/50 p-4">
                <div className="space-y-2">
                  <div className="h-2 w-3/4 rounded bg-primary/20" />
                  <div className="h-2 w-1/2 rounded bg-primary/20" />
                  <div className="h-2 w-2/3 rounded bg-primary/20" />
                </div>
              </div>
            </div>
          </SolutionCard>

          {config.benefits.map((benefit) => (
            <MiniItemCard item={benefit} key={benefit.title} />
          ))}
        </div>
      </section>

      <section className="mb-24">
        <SectionTitle>
          {config.coreFeaturesTitle ?? 'Core Features'}
        </SectionTitle>
        <div className="grid gap-6 md:grid-cols-3">
          {config.coreFeatures.map((feature) => (
            <CoreFeatureCard item={feature} key={feature.title} />
          ))}
        </div>
      </section>

      <section className="mb-24">
        <SolutionCard className="overflow-hidden">
          <div className="grid md:grid-cols-2">
            <div className="p-8">
              <div className="mb-4 text-primary">
                {config.story.icon ?? <Star className="h-8 w-8" />}
              </div>
              <h2 className="mb-4 font-bold text-2xl">Success Story</h2>
              <p className="mb-4 text-muted-foreground">{config.story.quote}</p>
              <p className="font-semibold">{config.story.author}</p>
              <p className="text-muted-foreground text-sm">
                {config.story.role}
              </p>
            </div>
            <div className="flex items-center justify-center bg-primary/5 p-8">
              <div className="grid gap-4 text-center">
                {config.story.metrics.map((metric) => (
                  <div key={metric.label}>
                    <div className="mb-2 font-bold text-3xl text-primary">
                      {metric.value}
                    </div>
                    <div className="text-muted-foreground text-sm">
                      {metric.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </SolutionCard>
      </section>

      <section>
        <SectionTitle>Frequently Asked Questions</SectionTitle>
        <FaqList faqs={config.faqs} />
      </section>

      <section className="mt-24 text-center">
        <SolutionCard className="border-primary bg-primary/5 p-12">
          <h2 className="mb-4 font-bold text-3xl">{config.cta.title}</h2>
          <p className="mx-auto mb-8 max-w-2xl text-muted-foreground">
            {config.cta.description}
          </p>
          <div className="flex flex-col justify-center gap-4 sm:flex-row">
            <SolutionLinkButton href="/contact">Get Started</SolutionLinkButton>
            <SolutionLinkButton href="/pricing" variant="outline">
              View Pricing
            </SolutionLinkButton>
          </div>
        </SolutionCard>
      </section>
    </main>
  );
}
