import { Eye, Globe, Palette } from '@tuturuuu/icons/lucide';
import { cn } from '@tuturuuu/utils/format';
import type {
  DiversityKey,
  GlobalImpactKey,
  WomenInTechContent,
} from '../../data/women-in-tech/content';
import {
  Card,
  ImageFrame,
  SectionIntro,
  tones,
} from './women-in-tech-primitives';

const globalImpactItems = [
  { key: 'vietnam', tone: tones.red },
  { key: 'global', tone: tones.blue },
  { key: 'future', tone: tones.purple },
] satisfies Array<{ key: GlobalImpactKey; tone: typeof tones.pink }>;

const diversityItems = [
  { icon: Eye, key: 'perspective', tone: tones.pink },
  { icon: Palette, key: 'creativity', tone: tones.purple },
  { icon: Globe, key: 'market', tone: tones.blue },
] satisfies Array<{
  icon: typeof Eye;
  key: DiversityKey;
  tone: typeof tones.pink;
}>;

export function GlobalImpactSection({
  content,
}: {
  content: WomenInTechContent;
}) {
  return (
    <section className="relative px-4 py-20 sm:px-6 sm:py-24 lg:px-8 lg:py-32">
      <div className="mx-auto max-w-7xl">
        <SectionIntro
          subtitle={content.globalImpact.subtitle}
          title={content.globalImpact.title}
        />
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {globalImpactItems.map(({ key, tone }) => {
            const copy = content.globalImpact[key];
            return (
              <Card
                className={cn(
                  'group h-full p-8 text-center transition-all hover:-translate-y-2 hover:shadow-xl',
                  tone.card
                )}
                key={key}
              >
                <div
                  className={cn(
                    'mx-auto mb-6 h-2 w-24 rounded-full bg-linear-to-r',
                    tone.gradient
                  )}
                />
                <h3
                  className={cn(
                    'mb-4 bg-linear-to-r bg-clip-text font-bold text-2xl text-transparent',
                    tone.gradient
                  )}
                >
                  {copy.title}
                </h3>
                <p className="text-foreground/70">{copy.description}</p>
              </Card>
            );
          })}
        </div>
        <div className="mt-16 grid gap-8 md:grid-cols-2">
          <ImageFrame
            alt="Women in Tech: Vietnam to the World"
            className="aspect-video border-dynamic-purple/30 bg-dynamic-purple/5"
            src="/media/marketing/events/women-in-tech/experiences-with-women-in-tech-peers-from-vietnam-to-the-world.jpg"
          />
          <ImageFrame
            alt="Global Tech Collaboration"
            className="aspect-video border-dynamic-pink/30 bg-dynamic-pink/5"
            src="/media/marketing/events/women-in-tech/experiences-with-women-in-tech-peers-from-vietnam-to-the-world-2.jpg"
          />
        </div>
      </div>
    </section>
  );
}

export function TeamSection({ content }: { content: WomenInTechContent }) {
  return (
    <section className="relative px-4 py-20 sm:px-6 sm:py-24 lg:px-8 lg:py-32">
      <div className="mx-auto max-w-7xl">
        <SectionIntro
          subtitle={content.team.subtitle}
          title={content.team.title}
        />
        <Card className="group overflow-hidden border border-dynamic-pink/30 bg-dynamic-pink/10 p-0 shadow-xl transition-all hover:border-dynamic-pink/50 hover:shadow-2xl">
          <div className="relative aspect-video w-full overflow-hidden bg-dynamic-pink/5">
            <img
              src="/media/marketing/events/women-in-tech/team.jpg"
              alt={content.team.imageTitle}
              className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-linear-to-t from-dynamic-pink/10 via-dynamic-pink/5 to-transparent" />
          </div>
          <div className="p-8 text-center">
            <h3 className="mb-3 bg-linear-to-r from-dynamic-purple to-dynamic-pink bg-clip-text font-bold text-2xl text-transparent">
              {content.team.imageTitle}
            </h3>
            <p className="mx-auto max-w-2xl text-foreground/80">
              {content.team.imageDescription}
            </p>
          </div>
        </Card>
      </div>
    </section>
  );
}

export function DiversitySection({ content }: { content: WomenInTechContent }) {
  return (
    <section className="relative px-4 py-20 sm:px-6 sm:py-24 lg:px-8 lg:py-32">
      <div className="mx-auto max-w-7xl">
        <SectionIntro title={content.diversity.title} />
        <div className="grid gap-6 md:grid-cols-3">
          {diversityItems.map(({ icon: Icon, key, tone }) => {
            const copy = content.diversity.items[key];
            return (
              <Card
                className={cn(
                  'group h-full p-8 transition-all hover:-translate-y-2 hover:shadow-xl',
                  tone.card
                )}
                key={key}
              >
                <div className="mb-6 flex justify-center">
                  <div
                    className={cn(
                      'flex h-20 w-20 items-center justify-center rounded-2xl bg-linear-to-br shadow-lg transition-transform group-hover:scale-110',
                      tone.gradient
                    )}
                  >
                    <Icon className="h-10 w-10 text-white" />
                  </div>
                </div>
                <h3
                  className={cn(
                    'mb-4 bg-linear-to-r bg-clip-text text-center font-bold text-2xl text-transparent',
                    tone.gradient
                  )}
                >
                  {copy.title}
                </h3>
                <p className="text-center text-foreground/70">
                  {copy.description}
                </p>
                <div className="mt-6 flex justify-center">
                  <div
                    className={cn(
                      'h-1 w-16 rounded-full bg-linear-to-r transition-all group-hover:w-24',
                      tone.gradient
                    )}
                  />
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
