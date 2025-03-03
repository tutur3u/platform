import { Metadata } from 'next';
import { HorseRacingVisualization } from '@/components/visualizations/horse-racing/visualization';

export const metadata: Metadata = {
  title: 'Horse Racing Algorithm Visualization',
  description: 'Interactive visualization of the horse racing ranking algorithm that determines the ranking of N horses when we can only race M horses at a time.',
};

export default function HorseRacingPage() {
  return (
    <div className="container py-10">
      <div className="mb-10 space-y-4">
        <h1 className="text-4xl font-bold tracking-tight">Horse Racing Algorithm Visualization</h1>
        <p className="text-lg text-muted-foreground">
          This interactive visualization demonstrates how to rank N horses when we can only race M horses at a time.
          The algorithm efficiently determines the complete ranking with the minimum number of races.
        </p>
      </div>
      <HorseRacingVisualization />
    </div>
  );
}