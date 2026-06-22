import { Building2, Layers } from '@tuturuuu/icons/lucide';
import type { AboutContent } from './about-content';
import {
  AboutButtonLink,
  AboutCard,
  AboutSectionHeading,
  aboutColorClasses,
  joinClassNames,
} from './about-primitives';
import { AboutSection, DetailRow } from './about-section-shell';

type AboutContentProps = Readonly<{ content: AboutContent }>;

export function CommunitySection({ content }: AboutContentProps) {
  const { aboutCopy, communityStats, cultureValues } = content;

  return (
    <AboutSection>
      <AboutSectionHeading
        gradient="community"
        highlight={aboutCopy.community.titleHighlight}
        part1={aboutCopy.community.titlePart1}
        subtitle={aboutCopy.community.subtitle}
      />
      <div className="mb-12 grid gap-8 md:grid-cols-3">
        {communityStats.map((stat) => {
          const Icon = stat.icon;
          const classes = aboutColorClasses[stat.color];
          return (
            <AboutCard
              className="p-8 text-center hover:shadow-lg"
              color={stat.color}
              key={stat.title}
            >
              <div
                className={joinClassNames(
                  'mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl',
                  classes.iconBox
                )}
              >
                <Icon className={joinClassNames('h-8 w-8', classes.text)} />
              </div>
              <div
                className={joinClassNames(
                  'mb-2 font-bold text-4xl',
                  classes.text
                )}
              >
                {stat.value}
              </div>
              <h3 className="mb-2 font-semibold text-lg">{stat.title}</h3>
              <p className="text-foreground/60 text-sm">{stat.description}</p>
            </AboutCard>
          );
        })}
      </div>
      <AboutCard className="overflow-hidden border-dynamic-purple/30 bg-linear-to-br from-dynamic-purple/10 via-dynamic-pink/5 to-background p-8 md:p-12">
        <div className="mb-8 text-center">
          <h3 className="mb-3 font-bold text-3xl">
            {aboutCopy.community.cultureTitle}
          </h3>
          <p className="mx-auto max-w-2xl text-foreground/60 text-lg">
            {aboutCopy.community.cultureSubtitle}
          </p>
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {cultureValues.map((value) => {
            const Icon = value.icon;
            return (
              <div
                className="rounded-lg border border-dynamic-purple/20 bg-background/50 p-6 backdrop-blur-sm transition-all hover:border-dynamic-purple/40 hover:shadow-md"
                key={value.title}
              >
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-dynamic-purple/10">
                  <Icon className="h-5 w-5 text-dynamic-purple" />
                </div>
                <h4 className="mb-2 font-semibold">{value.title}</h4>
                <p className="text-foreground/60 text-sm">
                  {value.description}
                </p>
              </div>
            );
          })}
        </div>
      </AboutCard>
    </AboutSection>
  );
}

export function CompanyInfoSection({ content }: AboutContentProps) {
  const { aboutCopy, companyLinks } = content;

  return (
    <AboutSection>
      <AboutCard className="overflow-hidden p-8 md:p-12" color="blue">
        <div className="mb-8 flex items-start gap-6">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-dynamic-blue/10">
            <Building2 className="h-8 w-8 text-dynamic-blue" />
          </div>
          <div>
            <h2 className="mb-2 font-bold text-3xl">
              {aboutCopy.company.title}
            </h2>
            <p className="text-foreground/60">{aboutCopy.company.subtitle}</p>
          </div>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <h3 className="mb-3 font-semibold text-dynamic-blue text-sm uppercase tracking-wide">
              {aboutCopy.company.detailsTitle}
            </h3>
            <dl className="space-y-2 text-sm">
              <DetailRow
                label={aboutCopy.company.taxCode}
                value={aboutCopy.company.taxCodeValue}
              />
              <DetailRow
                label={aboutCopy.company.founded}
                value={aboutCopy.company.foundedValue}
              />
              <DetailRow
                label={aboutCopy.company.ceo}
                value={aboutCopy.company.ceoValue}
              />
            </dl>
          </div>
          <div>
            <h3 className="mb-3 font-semibold text-dynamic-blue text-sm uppercase tracking-wide">
              {aboutCopy.company.locationTitle}
            </h3>
            <p className="text-foreground/70 text-sm leading-relaxed">
              {aboutCopy.company.address.map((line) => (
                <span key={line}>
                  {line}
                  <br />
                </span>
              ))}
            </p>
          </div>
        </div>
        <div className="mt-8 flex flex-wrap gap-3 border-dynamic-blue/20 border-t pt-8">
          {companyLinks.map((link) => {
            const Icon = link.icon;
            const isExternal = link.href.startsWith('http');
            return (
              <AboutButtonLink
                href={link.href}
                key={link.label}
                rel={isExternal ? 'noopener noreferrer' : undefined}
                size="sm"
                target={isExternal ? '_blank' : undefined}
                variant="outline"
              >
                <Icon className="h-4 w-4" />
                {link.label}
              </AboutButtonLink>
            );
          })}
        </div>
      </AboutCard>
    </AboutSection>
  );
}

export function CtaSection({ content }: AboutContentProps) {
  const { aboutCopy } = content;

  return (
    <section className="relative px-4 py-24 pb-32 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <AboutCard className="overflow-hidden border-dynamic-purple/30 bg-linear-to-br from-dynamic-purple/10 via-dynamic-pink/5 to-background p-12 text-center">
          <h2 className="mb-4 font-bold text-3xl sm:text-4xl">
            {aboutCopy.cta.title}
          </h2>
          <p className="mx-auto mb-8 max-w-2xl text-foreground/70 text-lg">
            {aboutCopy.cta.description}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <AboutButtonLink
              href="https://github.com/tutur3u/platform"
              rel="noopener noreferrer"
              target="_blank"
            >
              <Layers className="h-5 w-5" />
              {aboutCopy.cta.contribute}
            </AboutButtonLink>
            <AboutButtonLink
              href="mailto:contact@tuturuuu.com"
              variant="outline"
            >
              {aboutCopy.cta.getInTouch}
            </AboutButtonLink>
          </div>
        </AboutCard>
      </div>
    </section>
  );
}
