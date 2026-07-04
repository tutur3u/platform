import type { AboutContent } from './about-content';
import {
  AboutCard,
  AboutSectionHeading,
  aboutColorClasses,
  joinClassNames,
} from './about-primitives';
import {
  AboutSection,
  FeatureCard,
  IconCard,
  TimelineCard,
} from './about-section-shell';

type AboutContentProps = Readonly<{ content: AboutContent }>;

export function EcosystemSection({ content }: AboutContentProps) {
  const { aboutCopy, aiCore, ecosystemApps } = content;

  return (
    <AboutSection>
      <AboutSectionHeading
        gradient="ecosystem"
        highlight={aboutCopy.ecosystem.titleHighlight}
        part1={aboutCopy.ecosystem.titlePart1}
        subtitle={aboutCopy.ecosystem.subtitle}
      />
      <div className="mb-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {ecosystemApps.map((app) => (
          <IconCard
            card={app}
            className="p-6 text-center"
            iconBoxClassName="mx-auto h-12 w-12 rounded-xl transition-transform group-hover:scale-110"
            iconClassName="h-6 w-6"
            key={app.title}
            titleClassName="text-lg"
          />
        ))}
      </div>
      <AboutCard
        className="mb-12 border-dynamic-purple/30 bg-linear-to-br from-dynamic-purple/5 via-background to-background p-8"
        color="purple"
      >
        <div className="mb-6 text-center">
          <h3 className="mb-2 font-bold text-2xl">
            {aboutCopy.ecosystem.aiTitle}
          </h3>
          <p className="text-foreground/60">{aboutCopy.ecosystem.aiSubtitle}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {aiCore.map((ai) => {
            const Icon = ai.icon;
            const classes = aboutColorClasses[ai.color];
            return (
              <div
                className={joinClassNames(
                  'rounded-lg border p-4 text-center transition-all hover:shadow-md',
                  classes.card
                )}
                key={ai.name}
              >
                <div
                  className={joinClassNames(
                    'mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-lg',
                    classes.iconBox
                  )}
                >
                  <Icon className={joinClassNames('h-5 w-5', classes.text)} />
                </div>
                <h4 className="mb-1 font-semibold text-sm">{ai.name}</h4>
                <p className="text-foreground/50 text-xs">{ai.role}</p>
              </div>
            );
          })}
        </div>
      </AboutCard>
    </AboutSection>
  );
}

export function TechStackSection({ content }: AboutContentProps) {
  const { aboutCopy, techStacks } = content;

  return (
    <AboutSection>
      <AboutSectionHeading
        gradient="tech"
        highlight={aboutCopy.techStack.titleHighlight}
        part1={aboutCopy.techStack.titlePart1}
        subtitle={aboutCopy.techStack.subtitle}
      />
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {techStacks.map((stack) => {
          const Icon = stack.icon;
          const classes = aboutColorClasses[stack.color];
          return (
            <AboutCard
              className="group h-full p-6 hover:shadow-lg"
              color={stack.color}
              key={stack.category}
            >
              <div
                className={joinClassNames(
                  'mb-4 flex h-12 w-12 items-center justify-center rounded-xl transition-transform group-hover:scale-110',
                  classes.iconBox
                )}
              >
                <Icon className={joinClassNames('h-6 w-6', classes.text)} />
              </div>
              <h3 className="mb-3 font-bold text-lg">{stack.category}</h3>
              <ul className="space-y-1.5">
                {stack.techs.map((tech) => (
                  <li
                    className="flex items-center gap-2 text-foreground/60 text-sm"
                    key={tech}
                  >
                    <div
                      className={joinClassNames(
                        'h-1.5 w-1.5 rounded-full',
                        classes.dot
                      )}
                    />
                    {tech}
                  </li>
                ))}
              </ul>
            </AboutCard>
          );
        })}
      </div>
    </AboutSection>
  );
}

export function FeaturesSection({ content }: AboutContentProps) {
  const { aboutCopy, featureCards } = content;

  return (
    <AboutSection>
      <AboutSectionHeading
        gradient="features"
        highlight={aboutCopy.features.titleHighlight}
        part1={aboutCopy.features.titlePart1}
        subtitle={aboutCopy.features.subtitle}
      />
      <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
        {featureCards.map((feature) => (
          <FeatureCard feature={feature} key={feature.title} />
        ))}
      </div>
    </AboutSection>
  );
}

export function TimelineSection({ content }: AboutContentProps) {
  const { aboutCopy, timelineMilestones } = content;

  return (
    <AboutSection>
      <AboutSectionHeading
        gradient="timeline"
        highlight={aboutCopy.timeline.titleHighlight}
        part1={aboutCopy.timeline.titlePart1}
        subtitle={aboutCopy.timeline.subtitle}
      />
      <div className="relative">
        <div className="absolute top-0 bottom-0 left-1/2 hidden w-0.5 -translate-x-1/2 bg-linear-to-b from-dynamic-purple via-dynamic-blue to-dynamic-green md:block" />
        <div className="space-y-8 md:space-y-12">
          {timelineMilestones.map((milestone, index) => (
            <TimelineCard
              index={index}
              key={milestone.title}
              milestone={milestone}
            />
          ))}
        </div>
      </div>
    </AboutSection>
  );
}
