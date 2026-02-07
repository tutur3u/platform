import { OtherAchievements, TopThreeAchievements } from './client';
import { achievements } from './data';
import { Badge } from '@ncthub/ui/badge';
import { Award } from '@ncthub/ui/icons';
import { Separator } from '@ncthub/ui/separator';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Hall of Fame | Achievements',
  description:
    "Celebrating our teams' outstanding achievements in competitions, hackathons, and innovation challenges.",
  keywords:
    'achievements, hall of fame, competitions, hackathons, awards, innovation',
};

export default function AchievementsPage() {
  return (
    <div className="container mx-auto">
      <section className="px-4 py-8 sm:px-6 lg:px-8">
        <div className="my-12 space-y-8 text-center">
          <div className="inline-flex items-center justify-center">
            <Badge
              variant="outline"
              className="border-[#5FC6E5]/50 px-3 py-1 text-base text-[#5FC6E5]"
            >
              <Award className="h-5 w-5 text-[#FBC721] md:h-6 md:w-6" />
              Warriors of the Stage
            </Badge>
          </div>
          <h1 className="text-5xl font-bold tracking-tight md:text-6xl">
            Hall of{' '}
            <span className="border-b-4 border-[#FBC721] text-[#5FC6E5]">
              Fame
            </span>
          </h1>
          <p className="mx-auto max-w-5xl text-lg text-foreground/80 md:text-xl">
            Celebrating our teams&apos; outstanding achievements in
            competitions, hackathons, and innovation challenges. Discover the
            brilliant minds behind groundbreaking solutions and innovative
            technologies.
          </p>
        </div>
        <TopThreeAchievements achievements={achievements.slice(0, 3)} />
      </section>

      <Separator className="my-6" />

      <section className="px-4 py-12 sm:px-6 lg:px-8">
        <div className="my-12 text-center">
          <h1 className="text-4xl font-bold tracking-tight text-foreground md:text-5xl">
            Other Achievements
          </h1>
        </div>
        <OtherAchievements achievements={achievements.slice(3)} />
      </section>
    </div>
  );
}
