import {
  Code2,
  GraduationCap,
  Heart,
  Lightbulb,
  Sparkles,
  Star,
  Target,
  Users,
  Zap,
} from '@tuturuuu/icons/lucide';
import { cn } from '@tuturuuu/utils/format';
import type {
  ImpactStatKey,
  LeadershipKey,
  ValueKey,
  WomenInTechContent,
} from '../../data/women-in-tech/content';
import {
  Card,
  ImageFrame,
  SectionIntro,
  tones,
} from './women-in-tech-primitives';

const leadershipItems = [
  {
    key: 'executives',
    image:
      '/media/marketing/events/women-in-tech/first-women-coo-with-first-women-people-and-operations-coordinator.jpeg',
    tone: tones.purple,
  },
  {
    key: 'engineering',
    image:
      '/media/marketing/events/women-in-tech/anh-thu-first-women-contributor.jpg',
    reverse: true,
    tone: tones.pink,
  },
  {
    key: 'marketing',
    image:
      '/media/marketing/events/women-in-tech/next-generation-of-women-marketing-leader.jpg',
    tone: tones.blue,
  },
  {
    key: 'remote',
    image:
      '/media/marketing/events/women-in-tech/linh-dan-first-remote-women-software-engineer-intern.jpeg',
    reverse: true,
    tone: tones.green,
  },
] satisfies Array<{
  image: string;
  key: LeadershipKey;
  reverse?: boolean;
  tone: typeof tones.pink;
}>;

const impactStats = [
  { icon: Lightbulb, key: 'innovation', tone: tones.yellow },
  { icon: Target, key: 'leadership', tone: tones.purple },
  { icon: Zap, key: 'growth', tone: tones.blue },
] satisfies Array<{
  icon: typeof Lightbulb;
  key: ImpactStatKey;
  tone: typeof tones.pink;
}>;

const valueItems = [
  { icon: Star, key: 'excellence', tone: tones.yellow },
  { icon: Lightbulb, key: 'innovation', tone: tones.orange },
  { icon: Users, key: 'collaboration', tone: tones.blue },
  { icon: GraduationCap, key: 'growth', tone: tones.purple },
  { icon: Heart, key: 'inclusion', tone: tones.pink },
  { icon: Code2, key: 'excellence-tech', tone: tones.green },
] satisfies Array<{
  icon: typeof Lightbulb;
  key: ValueKey;
  tone: typeof tones.pink;
}>;

export function LeadershipSection({
  content,
}: {
  content: WomenInTechContent;
}) {
  return (
    <section className="relative px-4 py-20 sm:px-6 sm:py-24 lg:px-8 lg:py-32">
      <div className="mx-auto max-w-7xl">
        <SectionIntro
          subtitle={content.womenInLeadership.subtitle}
          title={content.womenInLeadership.title}
        />
        <div className="space-y-20">
          {leadershipItems.map((item) => {
            const copy = content.womenInLeadership[item.key];
            return (
              <div
                key={item.key}
                className="grid gap-8 text-center md:grid-cols-2 md:items-center md:text-balance"
              >
                <ImageFrame
                  alt={copy.name}
                  className={cn(
                    item.tone.card,
                    item.reverse && 'order-1 md:order-2'
                  )}
                  imageClassName="aspect-4/3"
                  priority
                  src={item.image}
                />
                <div className={cn(item.reverse && 'order-2 md:order-1')}>
                  <div
                    className={cn(
                      'mb-4 inline-block rounded-full border px-4 py-2',
                      item.tone.badge
                    )}
                  >
                    <span className="font-semibold text-sm">{copy.title}</span>
                  </div>
                  <h3 className="mb-2 font-bold text-3xl">{copy.name}</h3>
                  <p className="mb-4 text-foreground/60 text-sm">
                    {copy.roles}
                  </p>
                  <p className="text-balance text-foreground/80">
                    {copy.story}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function ImpactSection({ content }: { content: WomenInTechContent }) {
  return (
    <section className="relative px-4 py-20 sm:px-6 sm:py-24 lg:px-8 lg:py-32">
      <div className="mx-auto max-w-7xl">
        <SectionIntro
          subtitle={content.impact.subtitle}
          title={
            <>
              {content.impact.title.part1}{' '}
              <span className="bg-linear-to-r from-dynamic-pink via-dynamic-purple to-dynamic-blue bg-clip-text text-transparent">
                {content.impact.title.highlight}
              </span>
            </>
          }
        />
        <div className="grid gap-8 md:grid-cols-3">
          {impactStats.map(({ icon: Icon, key, tone }) => {
            const copy = content.impact.stats[key];
            return (
              <Card
                className={cn(
                  'group h-full p-8 text-center transition-all hover:-translate-y-2 hover:shadow-lg',
                  tone.card
                )}
                key={key}
              >
                <div
                  className={cn(
                    'mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-linear-to-br',
                    tone.gradient
                  )}
                >
                  <Icon className="h-8 w-8 text-white" />
                </div>
                <div
                  className={cn(
                    'mb-3 bg-linear-to-r bg-clip-text font-bold text-5xl text-transparent',
                    tone.gradient
                  )}
                >
                  {copy.title}
                </div>
                <div className="mb-3 font-semibold text-foreground/90 text-sm uppercase tracking-wide">
                  {copy.subtitle}
                </div>
                <div
                  className={cn(
                    'mx-auto mb-4 h-1 w-16 rounded-full bg-linear-to-r',
                    tone.gradient
                  )}
                />
                <p className="text-foreground/70 text-sm">{copy.description}</p>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function ValuesSection({ content }: { content: WomenInTechContent }) {
  return (
    <section className="relative px-4 py-20 text-center sm:px-6 sm:py-24 lg:px-8 lg:py-32">
      <div className="mx-auto max-w-7xl">
        <SectionIntro
          subtitle={content.values.subtitle}
          title={content.values.title}
        />
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {valueItems.map(({ icon: Icon, key, tone }) => {
            const copy = content.values.items[key];
            return (
              <Card
                className={cn(
                  'flex h-full flex-col items-center justify-center p-6 transition-all hover:-translate-y-1 hover:shadow-md',
                  tone.card
                )}
                key={key}
              >
                <div
                  className={cn(
                    'mb-4 flex h-12 w-12 items-center justify-center rounded-xl',
                    tone.iconBox
                  )}
                >
                  <Icon className={cn('h-6 w-6', tone.icon)} />
                </div>
                <h3 className="mb-2 font-bold text-lg">{copy.title}</h3>
                <p className="text-foreground/70 text-sm">{copy.description}</p>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function FounderMessageSection({
  content,
}: {
  content: WomenInTechContent;
}) {
  return (
    <section className="relative px-4 py-20 sm:px-6 sm:py-24 lg:px-8 lg:py-32">
      <div className="mx-auto max-w-6xl">
        <Card className="overflow-hidden border border-dynamic-purple/20 bg-dynamic-purple/10 p-8 shadow-xl md:p-12">
          <div className="flex flex-col gap-8 md:flex-row md:items-start">
            <div className="flex shrink-0 flex-col items-center gap-4">
              <ImageFrame
                alt={content.ceo.name}
                className="h-64 w-64 border-dynamic-purple/30 bg-dynamic-purple/5"
                priority
                src="/media/marketing/events/women-in-tech/founder.jpg"
              />
              <div className="text-center">
                <div className="mb-1 font-bold text-xl">{content.ceo.name}</div>
                <div className="text-dynamic-purple text-sm">
                  {content.ceo.title}
                </div>
                <div className="text-foreground/60 text-xs">
                  {content.ceo.company}
                </div>
              </div>
            </div>
            <div className="flex-1">
              <div className="mb-6 flex flex-col items-center gap-3 md:flex-row">
                <div className="mb-4 flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-dynamic-purple/10">
                  <Sparkles className="h-6 w-6 text-dynamic-purple" />
                </div>
                <h2 className="bg-linear-to-r from-dynamic-purple to-dynamic-pink bg-clip-text pb-4 text-center font-bold text-transparent text-xl md:text-balance md:text-start md:text-3xl">
                  {content.ceo.messageTitle}
                </h2>
              </div>
              <div className="space-y-4 text-foreground/80">
                {['paragraph1', 'paragraph2', 'paragraph3', 'paragraph4'].map(
                  (key) => (
                    <p key={key}>
                      {
                        content.ceo.message[
                          key as keyof typeof content.ceo.message
                        ]
                      }
                    </p>
                  )
                )}
              </div>
              <div className="mt-6 rounded-lg border-dynamic-purple/20 border-l-4 bg-dynamic-purple/5 p-4">
                <p className="text-foreground/90 text-sm italic">
                  {content.ceo.message.closing}
                </p>
                <p className="mt-2 font-semibold text-foreground">
                  {content.ceo.name}
                </p>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </section>
  );
}
