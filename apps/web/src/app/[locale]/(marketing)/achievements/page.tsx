import AchievementsClient from './client';
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
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-12 sm:px-6 lg:px-8">
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
        <AchievementsClient />
      </div>
    </div>
  );
}
