import { CheckCircle2 } from '@tuturuuu/icons/lucide';
import type { ReactNode } from 'react';
import type {
  FeatureCardContent,
  IconCardContent,
  TimelineContent,
} from './about-content';
import {
  AboutBadge,
  AboutCard,
  aboutColorClasses,
  joinClassNames,
} from './about-primitives';

export function AboutSection({
  children,
  id,
}: {
  children: ReactNode;
  id?: string;
}) {
  return (
    <section className="relative px-4 py-24 sm:px-6 lg:px-8" id={id}>
      <div className="mx-auto max-w-7xl">{children}</div>
    </section>
  );
}

export function IconCard({
  card,
  className = 'p-8',
  iconBoxClassName = 'h-12 w-12 rounded-xl',
  iconClassName = 'h-6 w-6',
  titleClassName = 'text-2xl',
}: {
  card: IconCardContent;
  className?: string;
  iconBoxClassName?: string;
  iconClassName?: string;
  titleClassName?: string;
}) {
  const Icon = card.icon;
  const classes = aboutColorClasses[card.color];

  return (
    <AboutCard
      className={joinClassNames('group h-full hover:shadow-lg', className)}
      color={card.color}
    >
      <div
        className={joinClassNames(
          'mb-4 flex items-center justify-center',
          iconBoxClassName,
          classes.iconBox
        )}
      >
        <Icon className={joinClassNames(iconClassName, classes.text)} />
      </div>
      <h3 className={joinClassNames('mb-3 font-bold', titleClassName)}>
        {card.title}
      </h3>
      <p className="text-foreground/70 leading-relaxed">{card.description}</p>
    </AboutCard>
  );
}

export function FeatureCard({ feature }: { feature: FeatureCardContent }) {
  const Icon = feature.icon;
  const classes = aboutColorClasses[feature.color];

  return (
    <AboutCard
      className="group h-full p-6 hover:shadow-lg"
      color={feature.color}
    >
      <div
        className={joinClassNames(
          'mb-4 flex h-12 w-12 items-center justify-center rounded-xl transition-transform group-hover:rotate-12 group-hover:scale-110',
          classes.iconBox
        )}
      >
        <Icon className={joinClassNames('h-6 w-6', classes.text)} />
      </div>
      <h3 className="mb-2 font-bold text-xl">{feature.title}</h3>
      <p className="mb-4 text-foreground/60 text-sm leading-relaxed">
        {feature.description}
      </p>
      <div className="flex flex-wrap gap-2">
        {feature.features.map((item) => (
          <AboutBadge color={feature.color} key={item}>
            {item}
          </AboutBadge>
        ))}
      </div>
    </AboutCard>
  );
}

export function TimelineCard({
  index,
  milestone,
}: {
  index: number;
  milestone: TimelineContent;
}) {
  const Icon = milestone.icon;
  const classes = aboutColorClasses[milestone.color];
  const isEven = index % 2 === 0;

  return (
    <div className="relative">
      <div
        className={
          isEven
            ? 'md:grid md:grid-cols-2 md:gap-8'
            : 'md:grid md:grid-flow-dense md:grid-cols-2 md:gap-8'
        }
      >
        <div
          className={
            isEven ? 'relative md:pr-12' : 'relative md:col-start-2 md:pl-12'
          }
        >
          <AboutCard className="p-6 hover:shadow-lg" color={milestone.color}>
            <AboutBadge className="mb-3" color={milestone.color}>
              {milestone.phase}
            </AboutBadge>
            <h3 className="mb-1 font-bold text-2xl">{milestone.title}</h3>
            <p className="mb-3 text-foreground/50 text-sm">
              {milestone.period}
            </p>
            <p className="mb-4 text-foreground/70 leading-relaxed">
              {milestone.description}
            </p>
            <div className="flex flex-wrap gap-2">
              {milestone.achievements.map((achievement) => (
                <div
                  className="flex items-center gap-1.5 text-foreground/60 text-sm"
                  key={achievement}
                >
                  <CheckCircle2
                    className={joinClassNames('h-4 w-4', classes.text)}
                  />
                  {achievement}
                </div>
              ))}
            </div>
          </AboutCard>
        </div>
        <div className="absolute top-6 left-1/2 hidden -translate-x-1/2 md:block">
          <div className="relative flex h-14 w-14 items-center justify-center rounded-full border-4 border-background bg-background shadow-lg lg:h-16 lg:w-16">
            <div
              className={joinClassNames(
                'absolute inset-1 rounded-full',
                classes.node
              )}
            />
            <Icon
              className={joinClassNames(
                'relative z-10 h-6 w-6 lg:h-8 lg:w-8',
                classes.text
              )}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-medium text-foreground/50">{label}</dt>
      <dd className="text-foreground">{value}</dd>
    </div>
  );
}
