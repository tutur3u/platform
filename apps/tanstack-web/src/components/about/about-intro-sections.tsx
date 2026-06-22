import { ArrowRight, Globe, Sparkles } from '@tuturuuu/icons/lucide';
import type { AboutContent } from './about-content';
import {
  AboutBadge,
  AboutButtonLink,
  AboutCard,
  AboutHighlight,
  AboutSectionHeading,
  aboutColorClasses,
  joinClassNames,
} from './about-primitives';
import { AboutSection, IconCard } from './about-section-shell';

type AboutContentProps = Readonly<{ content: AboutContent }>;

export function HeroSection({ content }: AboutContentProps) {
  const { aboutCopy } = content;

  return (
    <section className="relative px-4 pt-24 pb-16 sm:px-6 sm:pt-32 sm:pb-20 lg:px-8 lg:pt-40 lg:pb-24">
      <div className="mx-auto max-w-7xl text-center">
        <AboutBadge className="mb-6" color="purple">
          <Sparkles className="h-3.5 w-3.5" />
          {aboutCopy.hero.badge}
        </AboutBadge>
        <h1 className="mb-6 text-balance font-bold text-4xl tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
          {aboutCopy.hero.titlePart1}{' '}
          <AboutHighlight gradient="hero">
            {aboutCopy.hero.titleHighlight}
          </AboutHighlight>
          <br />
          {aboutCopy.hero.titlePart2}
        </h1>
        <p className="mx-auto mb-12 max-w-3xl text-balance text-base text-foreground/70 leading-relaxed sm:text-lg md:text-xl">
          {aboutCopy.hero.description}
        </p>
        <div className="flex flex-col flex-wrap items-center justify-center gap-3 sm:flex-row sm:gap-4">
          <AboutButtonLink className="group w-full sm:w-auto" href="#vision">
            {aboutCopy.hero.visionCta}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </AboutButtonLink>
          <AboutButtonLink
            className="w-full sm:w-auto"
            href="https://github.com/tutur3u/platform"
            rel="noopener noreferrer"
            target="_blank"
            variant="outline"
          >
            <Globe className="h-4 w-4" />
            {aboutCopy.hero.openSourceCta}
          </AboutButtonLink>
        </div>
      </div>
    </section>
  );
}

export function VisionSection({ content }: AboutContentProps) {
  const { aboutCopy, visionCards } = content;

  return (
    <AboutSection id="vision">
      <AboutSectionHeading
        gradient="vision"
        highlight={aboutCopy.vision.titleHighlight}
        part1={aboutCopy.vision.titlePart1}
        subtitle={aboutCopy.vision.subtitle}
      />
      <div className="grid gap-8 md:grid-cols-2">
        {visionCards.map((card) => (
          <IconCard card={card} iconClassName="h-6 w-6" key={card.title} />
        ))}
      </div>
    </AboutSection>
  );
}

export function CoreBeliefsSection({ content }: AboutContentProps) {
  const { aboutCopy, coreBeliefs } = content;

  return (
    <AboutSection>
      <AboutSectionHeading
        gradient="core"
        highlight={aboutCopy.coreBeliefs.titleHighlight}
        part1={aboutCopy.coreBeliefs.titlePart1}
        subtitle={aboutCopy.coreBeliefs.subtitle}
      />
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {coreBeliefs.map((belief) => (
          <IconCard
            card={belief}
            className="p-6"
            iconBoxClassName="h-10 w-10 rounded-lg"
            iconClassName="h-5 w-5"
            key={belief.title}
            titleClassName="text-lg"
          />
        ))}
      </div>
    </AboutSection>
  );
}

export function ProblemSection({ content }: AboutContentProps) {
  const { aboutCopy, problemCards } = content;

  return (
    <AboutSection>
      <AboutSectionHeading
        badge={
          <AboutBadge className="mb-4" color="red">
            {aboutCopy.problem.badge}
          </AboutBadge>
        }
        gradient="problem"
        highlight={aboutCopy.problem.titleHighlight}
        part1={aboutCopy.problem.titlePart1}
      />
      <div className="grid gap-8 md:grid-cols-3">
        {problemCards.map((cost) => {
          const Icon = cost.icon;
          const classes = aboutColorClasses[cost.color];
          return (
            <AboutCard
              className="h-full p-8 text-center hover:shadow-lg"
              color={cost.color}
              key={cost.title}
            >
              <div
                className={joinClassNames(
                  'mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl',
                  classes.iconBox
                )}
              >
                <Icon className={joinClassNames('h-7 w-7', classes.text)} />
              </div>
              <h3 className="mb-2 font-bold text-xl">{cost.title}</h3>
              <div
                className={joinClassNames(
                  'mb-3 font-bold text-3xl',
                  classes.text
                )}
              >
                {cost.stat}
              </div>
              <p className="text-foreground/60 text-sm leading-relaxed">
                {cost.description}
              </p>
            </AboutCard>
          );
        })}
      </div>
    </AboutSection>
  );
}
