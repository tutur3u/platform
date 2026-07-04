import {
  ArrowRight,
  Heart,
  Rocket,
  Star,
  Users,
  Zap,
} from '@tuturuuu/icons/lucide';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import type {
  ColleagueKey,
  PartnershipKey,
  WomenInTechContent,
} from '../../data/women-in-tech/content';
import { Card, SectionIntro, tones } from './women-in-tech-primitives';

const colleagueItems = [
  {
    key: 'phuc',
    image:
      '/media/marketing/events/women-in-tech/phuc-founder-ceo-of-tuturuuu.jpg',
    size: 'md:col-span-full lg:col-span-3',
    tone: tones.purple,
  },
  {
    key: 'henry',
    image: '/media/marketing/events/women-in-tech/henry-coo-of-tuturuuu.jpg',
    size: 'lg:col-span-3',
    tone: tones.blue,
  },
  {
    key: 'sam',
    image:
      '/media/marketing/events/women-in-tech/sam-software-engineer-at-tuturuuu.jpg',
    size: 'lg:col-span-2',
    tone: tones.green,
  },
  {
    key: 'khoi',
    image:
      '/media/marketing/events/women-in-tech/khoi-software-engineer-intern-at-tuturuuu.jpg',
    size: 'lg:col-span-2',
    tone: tones.red,
  },
  {
    key: 'khang',
    image:
      '/media/marketing/events/women-in-tech/khang-junior-software-engineer-at-tuturuuu.jpg',
    size: 'lg:col-span-2',
    tone: tones.orange,
  },
] satisfies Array<{
  image: string;
  key: ColleagueKey;
  size: string;
  tone: typeof tones.pink;
}>;

const partnershipItems = [
  {
    key: 'allmind',
    image:
      '/media/marketing/events/women-in-tech/empowering-women-led-startup-partners-from-allmind-2.jpeg',
    imageAlt: 'AllMind: Sophie & Sweet',
    size: 'xl:col-span-2',
    tone: tones.blue,
  },
  {
    key: 'rmit',
    image:
      '/media/marketing/events/women-in-tech/professor-iwona-miliszewska-dean-of-sset-rmit.jpg',
    imageAlt: 'RMIT University: Professor Iwona, Hoa & Nguyen',
    size: 'xl:col-span-2',
    tone: tones.red,
  },
  {
    key: 'soki',
    image:
      '/media/marketing/events/women-in-tech/soki-startup-another-women-led-startup-also-tuturuuus-neighbor-inside-spark-hub-community.jpg',
    imageAlt: 'SOKI Startup: Kim',
    size: 'xl:col-span-2',
    tone: tones.orange,
  },
  {
    key: 'nhung',
    image:
      '/media/marketing/events/women-in-tech/rbac-website-designed-and-developed-by-mai-nhung.jpg',
    imageAlt: 'Mai Nhung: rbac.vn Developer',
    size: 'xl:col-span-2',
    tone: tones.cyan,
  },
  {
    key: 'dai',
    image: '/media/marketing/events/women-in-tech/dai-rbac-project-leader.jpg',
    imageAlt: 'Dai: RBAC Project Leader',
    size: 'xl:col-span-2',
    tone: tones.purple,
  },
  {
    key: 'nhu',
    image:
      '/media/marketing/events/women-in-tech/nhu-rbac-project-assistant.jpg',
    imageAlt: 'Nhu: RBAC Project Assistant',
    size: 'xl:col-span-2',
    tone: tones.blue,
  },
  {
    key: 'community',
    image:
      '/media/marketing/events/women-in-tech/empowering-women-in-stem-from-student-club.jpg',
    imageAlt: 'Community Partnerships',
    size: 'xl:col-span-3',
    tone: tones.pink,
  },
  {
    key: 'sparkHub',
    image:
      '/media/marketing/events/women-in-tech/spark-hub-program-coordinator.jpeg',
    imageAlt: 'SPARK Hub: Tien',
    size: 'xl:col-span-3',
    tone: tones.green,
  },
] satisfies Array<{
  image: string;
  imageAlt: string;
  key: PartnershipKey;
  size: string;
  tone: typeof tones.pink;
}>;

export function ColleagueMessagesSection({
  content,
}: {
  content: WomenInTechContent;
}) {
  return (
    <section className="relative px-4 py-20 sm:px-6 sm:py-24 lg:px-8 lg:py-32">
      <div className="mx-auto max-w-7xl">
        <SectionIntro
          subtitle={content.maleColleagues.subtitle}
          title={
            <span className="bg-linear-to-r from-dynamic-blue via-dynamic-cyan to-dynamic-purple bg-clip-text text-transparent">
              {content.maleColleagues.title}
            </span>
          }
        />
        <Card className="group mb-16 overflow-hidden border border-dynamic-blue/30 bg-dynamic-blue/10 p-0 shadow-xl transition-all hover:border-dynamic-blue/50 hover:shadow-2xl">
          <div className="relative aspect-video w-full overflow-hidden bg-dynamic-blue/5">
            <img
              src="/media/marketing/events/women-in-tech/tuturuuu-male-colleagues.jpg"
              alt={content.maleColleagues.groupPhotoAlt}
              className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-linear-to-t from-dynamic-blue/10 via-dynamic-blue/5 to-transparent" />
          </div>
        </Card>
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-6">
          {colleagueItems.map(({ image, key, size, tone }) => {
            const copy = content.maleColleagues.wishes[key];
            return (
              <Card
                className={cn(
                  'group h-full overflow-hidden transition-all hover:-translate-y-2 hover:shadow-xl',
                  tone.card,
                  size
                )}
                key={key}
              >
                <div className="relative aspect-square overflow-hidden">
                  <img
                    src={image}
                    alt={copy.name}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-linear-to-t from-black/20 via-transparent to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
                </div>
                <div className="p-6">
                  <div className="mb-4 flex flex-col items-center gap-2">
                    <div
                      className={cn(
                        'inline-block rounded-full bg-linear-to-r px-4 py-1.5',
                        tone.gradient
                      )}
                    >
                      <span className="font-bold text-sm text-white">
                        {copy.name}
                      </span>
                    </div>
                    <p className="text-center text-foreground/60 text-xs">
                      {copy.role}
                    </p>
                  </div>
                  <div className="mb-3 flex justify-center">
                    <div
                      className={cn(
                        'h-1 w-12 rounded-full bg-linear-to-r',
                        tone.gradient
                      )}
                    />
                  </div>
                  <div className="relative">
                    <Heart className="absolute -top-2 -left-2 h-6 w-6 opacity-20" />
                    <p className="relative text-center text-foreground/80 text-sm italic leading-relaxed">
                      "{copy.message}"
                    </p>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function PartnershipsSection({
  content,
}: {
  content: WomenInTechContent;
}) {
  return (
    <section className="relative px-4 py-20 sm:px-6 sm:py-24 lg:px-8 lg:py-32">
      <div className="mx-auto max-w-7xl">
        <SectionIntro
          subtitle={content.partnerships.subtitle}
          title={content.partnerships.title}
        />
        <div className="grid gap-8 text-center md:grid-cols-2 xl:grid-cols-6">
          {partnershipItems.map(({ image, imageAlt, key, size, tone }) => {
            const copy = content.partnerships[key];
            return (
              <Card
                className={cn(
                  'h-full overflow-hidden p-0 shadow-xl transition-all hover:shadow-2xl',
                  tone.card,
                  size
                )}
                key={key}
              >
                <div className="relative aspect-video overflow-hidden">
                  <img
                    src={image}
                    alt={imageAlt}
                    className="h-full w-full object-cover transition-transform duration-500 hover:scale-105"
                    loading="lazy"
                  />
                </div>
                <div className="flex flex-col items-center justify-center p-8">
                  <div
                    className={cn(
                      'mb-4 inline-block rounded-full border px-4 py-2',
                      tone.badge
                    )}
                  >
                    <span className="font-semibold text-sm">{copy.title}</span>
                  </div>
                  <p className="text-foreground/80">{copy.description}</p>
                  {key === 'rmit' ? (
                    <a
                      href={content.partnerships.rmit.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-4 inline-flex items-center gap-2 text-dynamic-red text-sm transition-colors hover:text-dynamic-red/80"
                    >
                      {content.partnerships.rmit.linkText}
                      <ArrowRight className="h-4 w-4" />
                    </a>
                  ) : null}
                  {key === 'sparkHub' ? (
                    <div className="mt-4 rounded-r-lg border-dynamic-green/30 border-l-4 bg-dynamic-green/5 p-4">
                      <p className="text-foreground/70 text-sm italic">
                        "{content.partnerships.sparkHub.quote}"
                      </p>
                      <p className="mt-2 text-foreground/60 text-xs">
                        - Tien, SPARK Hub
                      </p>
                    </div>
                  ) : null}
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function FinalCtaSection({ content }: { content: WomenInTechContent }) {
  return (
    <section className="relative px-4 py-20 pb-32 sm:px-6 sm:py-24 lg:px-8 lg:py-32">
      <div className="mx-auto max-w-5xl">
        <Card className="relative overflow-hidden border border-dynamic-pink/30 bg-linear-to-br from-dynamic-pink/10 to-background p-12">
          <div className="relative text-center">
            <div className="mb-6 inline-block rounded-2xl bg-linear-to-r from-dynamic-pink to-dynamic-purple p-4 shadow-lg">
              <Rocket className="h-12 w-12 text-white" />
            </div>
            <h2 className="mb-4 bg-linear-to-r from-dynamic-pink via-dynamic-purple to-dynamic-blue bg-clip-text pb-4 font-bold text-2xl text-transparent md:text-4xl">
              {content.cta.title}
            </h2>
            <p className="mx-auto mb-8 max-w-2xl text-foreground/80 text-lg">
              {content.cta.description}
            </p>
            <div className="mb-8 flex flex-wrap items-center justify-center gap-4">
              <Button
                asChild
                className="bg-linear-to-r from-dynamic-pink to-dynamic-purple shadow-lg transition-all hover:shadow-xl"
                size="lg"
              >
                <a href="/careers">
                  <Rocket className="mr-2 h-5 w-5" />
                  {content.cta.joinTeam}
                </a>
              </Button>
              <Button
                asChild
                className="border-2 border-dynamic-pink/30 transition-all hover:border-dynamic-pink/50 hover:bg-dynamic-pink/5"
                size="lg"
                variant="outline"
              >
                <a href="/about">
                  <Heart className="mr-2 h-5 w-5" />
                  {content.cta.learnMore}
                </a>
              </Button>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-6 text-foreground/70 text-sm">
              <div className="flex items-center gap-2">
                <Star className="h-4 w-4 text-dynamic-yellow" />
                {content.cta.benefits.growth}
              </div>
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-dynamic-blue" />
                {content.cta.benefits.culture}
              </div>
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-dynamic-purple" />
                {content.cta.benefits.impact}
              </div>
            </div>
          </div>
        </Card>
      </div>
    </section>
  );
}
