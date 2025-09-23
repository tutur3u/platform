import { OtherAchivements, TopThreeAchivements } from './client';
import { achievements } from './data';
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
        <div className="my-12 text-center">
          <h1 className="bg-gradient-to-br from-purple-600 via-pink-500 to-orange-400 bg-clip-text text-5xl font-bold tracking-tight text-transparent md:text-6xl">
            Hall of Fame
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-sm text-muted-foreground md:text-lg">
            Celebrating our teams&apos; outstanding achievements in
            competitions, hackathons, and innovation challenges. Discover the
            brilliant minds behind groundbreaking solutions and innovative
            technologies.
          </p>
        </div>
        <TopThreeAchivements achievements={achievements.slice(0, 3)} />
      </section>

      <Separator className="my-6" />

      <section className="px-4 py-12 sm:px-6 lg:px-8">
        <div className="my-12 text-center">
          <h1 className="text-4xl font-bold tracking-tight text-foreground md:text-5xl">
            Other Achievements
          </h1>
        </div>
        <OtherAchivements achievements={achievements.slice(3)} />
      </section>
    </div>
  );
}
