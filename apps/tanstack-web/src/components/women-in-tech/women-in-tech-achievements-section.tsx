import { Award, Calendar, TrendingUp, Users } from '@tuturuuu/icons/lucide';
import { cn } from '@tuturuuu/utils/format';
import type {
  AchievementKey,
  WomenInTechContent,
} from '../../data/women-in-tech/content';
import { Card, SectionIntro, tones } from './women-in-tech-primitives';

const achievements = [
  { icon: Calendar, key: 'founding', tone: tones.pink },
  { icon: TrendingUp, key: 'growth', tone: tones.purple },
  { icon: Users, key: 'mentorship', tone: tones.blue },
  { icon: Award, key: 'community', tone: tones.green },
] satisfies Array<{
  icon: typeof Calendar;
  key: AchievementKey;
  tone: typeof tones.pink;
}>;

export function AchievementsSection({
  content,
}: {
  content: WomenInTechContent;
}) {
  return (
    <section className="relative px-4 py-20 sm:px-6 sm:py-24 lg:px-8 lg:py-32">
      <div className="mx-auto max-w-7xl">
        <SectionIntro
          subtitle={content.achievements.subtitle}
          title={content.achievements.title}
        />
        <div className="relative">
          <div className="absolute top-0 left-1/2 hidden h-full w-px -translate-x-1/2 bg-linear-to-b from-dynamic-pink via-dynamic-purple to-dynamic-blue lg:block" />
          <div className="space-y-12">
            {achievements.map(({ icon: Icon, key, tone }, index) => {
              const copy = content.achievements.items[key];
              return (
                <div
                  className={cn(
                    'relative grid gap-8 lg:grid-cols-2',
                    index % 2 === 0
                      ? 'text-center lg:text-right'
                      : 'text-center lg:text-left'
                  )}
                  key={key}
                >
                  <div
                    className={cn(
                      'lg:flex lg:flex-col',
                      index % 2 === 0
                        ? 'lg:items-end lg:pr-12'
                        : 'lg:col-start-2 lg:items-start lg:pl-12'
                    )}
                  >
                    <Card
                      className={cn(
                        'p-6 transition-all hover:-translate-y-1 hover:shadow-lg',
                        tone.card
                      )}
                    >
                      <div
                        className={cn(
                          'flex items-center gap-2',
                          index % 2 === 0
                            ? 'justify-center lg:justify-end'
                            : 'justify-center lg:justify-start'
                        )}
                      >
                        <div
                          className={cn(
                            'mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-linear-to-br',
                            tone.gradient
                          )}
                        >
                          <Icon className="h-6 w-6 text-white" />
                        </div>
                        <div
                          className={cn(
                            'mb-3 inline-block bg-linear-to-r bg-clip-text font-bold text-3xl text-transparent',
                            tone.gradient
                          )}
                        >
                          {copy.year}
                        </div>
                      </div>
                      <h3 className="mb-2 font-bold text-xl">{copy.title}</h3>
                      <p className="text-foreground/70 text-sm">
                        {copy.description}
                      </p>
                    </Card>
                  </div>
                  <div className="absolute top-6 left-1/2 hidden h-4 w-4 -translate-x-1/2 lg:block">
                    <div
                      className={cn(
                        'h-full w-full rounded-full bg-linear-to-r shadow-lg',
                        tone.gradient
                      )}
                    />
                    <div
                      className={cn(
                        'absolute inset-0 animate-ping rounded-full bg-linear-to-r opacity-75',
                        tone.gradient
                      )}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
