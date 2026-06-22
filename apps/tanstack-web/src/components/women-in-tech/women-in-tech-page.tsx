import { ArrowRight, Heart, Sparkles, Star, Zap } from '@tuturuuu/icons/lucide';
import { Button } from '@tuturuuu/ui/button';
import {
  getWomenInTechContent,
  type WomenInTechContent,
} from '../../data/women-in-tech/content';
import type { Locale } from '../../lib/platform/locale';
import { AchievementsSection } from './women-in-tech-achievements-section';
import {
  DiversitySection,
  GlobalImpactSection,
  TeamSection,
} from './women-in-tech-community-sections';
import { Badge, Card, LanguageSwitcher } from './women-in-tech-primitives';
import {
  ColleagueMessagesSection,
  FinalCtaSection,
  PartnershipsSection,
} from './women-in-tech-social-sections';
import {
  FounderMessageSection,
  ImpactSection,
  LeadershipSection,
  ValuesSection,
} from './women-in-tech-story-sections';

export function WomenInTechPage({ locale }: { locale: Locale }) {
  const content = getWomenInTechContent(locale);

  return (
    <main className="relative mx-auto w-full overflow-x-hidden text-balance">
      <WomenInTechBackground />
      <div className="relative mx-auto max-w-7xl px-4 pt-6 sm:px-6 sm:pt-4 lg:px-8 lg:pt-8">
        <LanguageSwitcher
          languageAvailable={content.languageAvailable}
          locale={locale}
        />
      </div>
      <HeroSection content={content} />
      <DotDivider />
      <QuoteSection content={content} />
      <LeadershipSection content={content} />
      <ImpactSection content={content} />
      <ValuesSection content={content} />
      <FounderMessageSection content={content} />
      <IconDivider />
      <AchievementsSection content={content} />
      <GlobalImpactSection content={content} />
      <TeamSection content={content} />
      <DiversitySection content={content} />
      <ColleagueMessagesSection content={content} />
      <PartnershipsSection content={content} />
      <LineDivider />
      <FinalCtaSection content={content} />
      <section className="relative px-4 pb-20 sm:px-6 sm:pb-24 lg:px-8 lg:pb-32">
        <div className="mx-auto max-w-7xl">
          <div className="flex items-center justify-center">
            <LanguageSwitcher
              className="items-center justify-center"
              languageAvailable={content.languageAvailable}
              locale={locale}
            />
          </div>
        </div>
      </section>
    </main>
  );
}

function WomenInTechBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10">
      <div className="absolute top-0 -left-1/4 h-160 w-160 rounded-full bg-linear-to-br from-dynamic-pink/20 via-dynamic-purple/10 to-transparent blur-3xl" />
      <div className="absolute top-1/3 -right-1/4 h-160 w-160 rounded-full bg-linear-to-br from-dynamic-purple/20 via-dynamic-pink/10 to-transparent blur-3xl" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(255,182,193,0.03)_1px,transparent_1px)] bg-size-[48px_48px]" />
    </div>
  );
}

function HeroSection({ content }: { content: WomenInTechContent }) {
  return (
    <section className="relative px-4 pt-8 pb-20 sm:px-6 sm:pt-12 sm:pb-24 lg:px-8 lg:pt-16 lg:pb-32">
      <div className="mx-auto max-w-7xl text-center">
        <Badge className="mb-6 border-dynamic-pink/30 bg-dynamic-pink/10 px-6 py-2 text-xs md:text-sm">
          <Heart className="mr-2 h-4 w-4 text-dynamic-pink" />
          {content.hero.badge}
        </Badge>
        <h1 className="mb-12 font-bold text-3xl tracking-tight sm:text-6xl md:text-7xl lg:text-8xl">
          {content.hero.title.part1}{' '}
          <span className="bg-linear-to-r from-dynamic-pink via-dynamic-purple to-dynamic-red bg-clip-text text-transparent">
            {content.hero.title.highlight}
          </span>
          <br />
          {content.hero.title.part2}
        </h1>
        <p className="mx-auto mb-10 max-w-3xl text-foreground/80 text-lg sm:text-xl md:text-2xl">
          {content.hero.description}
        </p>
        <div className="flex flex-col flex-wrap items-center justify-center gap-4 sm:flex-row">
          <Button
            asChild
            className="group relative overflow-hidden bg-linear-to-r from-dynamic-cyan to-dynamic-purple px-8 py-6 shadow-lg transition-all hover:shadow-xl sm:w-auto"
            size="lg"
          >
            <a href="/careers">
              <Zap className="mr-2 h-5 w-5" />
              {content.hero.cta.joinUs}
              <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
            </a>
          </Button>
          <Button
            asChild
            className="border-2 border-dynamic-pink/30 px-8 py-6 transition-all hover:border-dynamic-pink/50 hover:bg-dynamic-pink/5 sm:w-auto"
            size="lg"
            variant="outline"
          >
            <a href="/about">
              <Heart className="mr-2 h-5 w-5" />
              {content.hero.cta.learnMore}
            </a>
          </Button>
        </div>
      </div>
    </section>
  );
}

function QuoteSection({ content }: { content: WomenInTechContent }) {
  return (
    <section className="relative px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <Card className="relative border-2 border-dynamic-purple/20 bg-dynamic-purple/10 p-12 text-center md:p-16">
          <Sparkles className="absolute top-8 left-8 h-24 w-24 text-dynamic-pink opacity-10" />
          <Sparkles className="absolute right-8 bottom-8 h-24 w-24 rotate-180 text-dynamic-purple opacity-10" />
          <div className="relative">
            <div className="mb-6 text-6xl text-dynamic-pink/40">"</div>
            <p className="mb-6 bg-linear-to-r from-dynamic-pink via-dynamic-purple to-dynamic-pink bg-clip-text pb-4 font-bold text-2xl text-transparent sm:text-3xl md:text-4xl">
              {content.quote.text}
            </p>
            <div className="flex items-center justify-center gap-2 text-foreground/60">
              <div className="h-px w-8 bg-linear-to-r from-transparent to-dynamic-purple/50" />
              <span className="font-medium text-sm">
                {content.quote.author}
              </span>
              <div className="h-px w-8 bg-linear-to-l from-transparent to-dynamic-pink/50" />
            </div>
          </div>
        </Card>
      </div>
    </section>
  );
}

function DotDivider() {
  return (
    <div className="relative mx-auto max-w-4xl px-4 py-8">
      <div className="flex items-center gap-4">
        <div className="h-px flex-1 bg-linear-to-r from-transparent via-dynamic-pink/30 to-transparent" />
        <div className="flex gap-2">
          <div className="h-2 w-2 animate-pulse rounded-full bg-dynamic-pink/50" />
          <div className="h-2 w-2 animate-pulse rounded-full bg-dynamic-purple/50 delay-150" />
          <div className="h-2 w-2 animate-pulse rounded-full bg-dynamic-blue/50 delay-300" />
        </div>
        <div className="h-px flex-1 bg-linear-to-r from-transparent via-dynamic-purple/30 to-transparent" />
      </div>
    </div>
  );
}

function IconDivider() {
  return (
    <div className="relative mx-auto max-w-4xl px-4 py-12">
      <div className="flex items-center justify-center gap-4">
        <Heart className="h-5 w-5 text-dynamic-pink/40" />
        <div className="h-px w-32 bg-linear-to-r from-dynamic-pink/30 to-dynamic-purple/30" />
        <Sparkles className="h-5 w-5 text-dynamic-purple/40" />
        <div className="h-px w-32 bg-linear-to-r from-dynamic-purple/30 to-dynamic-blue/30" />
        <Star className="h-5 w-5 text-dynamic-blue/40" />
      </div>
    </div>
  );
}

function LineDivider() {
  return (
    <div className="relative mx-auto max-w-4xl px-4 py-12">
      <div className="h-px w-full bg-linear-to-r from-transparent via-dynamic-pink/40 to-transparent" />
    </div>
  );
}
