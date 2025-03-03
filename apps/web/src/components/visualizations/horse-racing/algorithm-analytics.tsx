import { BarChart, LineChart, PieChart } from '@/components/ui/charts';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import React, { useMemo } from 'react';

interface Horse {
  id: number;
  speed: number;
  color: string;
}

interface Race {
  horses: number[];
  result: number[];
  raceType: 'preliminary' | 'championship' | 'candidate';
  raceDescription: string;
}

interface AlgorithmAnalyticsProps {
  horses: Horse[];
  races: Race[];
  finalRanking: number[];
  raceSize: number;
  numHorses: number;
  currentRaceIndex: number;
}

export function AlgorithmAnalytics({
  horses,
  races,
  finalRanking,
  raceSize,
  numHorses,
  currentRaceIndex,
}: AlgorithmAnalyticsProps) {
  const [activeTab, setActiveTab] = React.useState('efficiency');

  // Calculate theoretical minimum races using log base 2
  const theoreticalMinimumRaces = useMemo(() => {
    // The theoretical minimum is O(N log_2(N) / log_2(M))
    return Math.ceil((numHorses * Math.log2(numHorses)) / Math.log2(raceSize));
  }, [numHorses, raceSize]);

  // Calculate race efficiency - should always be <= 100%
  const raceEfficiency = useMemo(() => {
    if (races.length === 0) return 0;
    return Math.min(100, (theoreticalMinimumRaces / races.length) * 100);
  }, [races.length, theoreticalMinimumRaces]);

  // Count races by type
  const raceTypeCounts = races.reduce(
    (acc, race) => {
      acc[race.raceType] = (acc[race.raceType] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  // Calculate horse participation data
  const horseParticipation = Array(numHorses).fill(0);
  races.slice(0, currentRaceIndex + 1).forEach((race) => {
    race.horses.forEach((horseId) => {
      horseParticipation[horseId]++;
    });
  });

  // Calculate average races per horse
  const avgRacesPerHorse =
    horseParticipation.reduce((sum, count) => sum + count, 0) / numHorses;

  // Generate data for race progression chart
  const raceProgressionData = races.map((_, index) => {
    const rankedAt = index + 1;
    const percentComplete =
      (Math.min(rankedAt, finalRanking.length) / numHorses) * 100;

    // Calculate the theoretical ideal progression
    // For an optimal algorithm, after k races, we should have ranked approximately k*log_2(M)/log_2(N) horses
    const optimalRanked = Math.min(
      numHorses,
      Math.floor((rankedAt * Math.log2(raceSize)) / Math.log2(numHorses))
    );
    const optimalPercentComplete = (optimalRanked / numHorses) * 100;

    return {
      race: rankedAt,
      percentComplete: parseFloat(percentComplete.toFixed(1)),
      theoreticalIdeal: parseFloat(optimalPercentComplete.toFixed(1)),
    };
  });

  // Generate data for horse participation chart
  const participationData = horses.map((horse) => ({
    horse: horse.id,
    races: horseParticipation[horse.id] || 0,
    speed: parseFloat(horse.speed.toFixed(1)),
  }));

  // Calculate how many comparisons were made (each race makes M(M-1)/2 comparisons)
  const totalComparisons = races
    .slice(0, currentRaceIndex + 1)
    .reduce((sum, race) => {
      const horsesInRace = race.horses.length;
      return sum + (horsesInRace * (horsesInRace - 1)) / 2;
    }, 0);

  // Calculate maximum possible comparisons if we compared every horse with every other horse
  const maxPossibleComparisons = (numHorses * (numHorses - 1)) / 2;

  // Calculate comparison efficiency
  const comparisonEfficiency =
    maxPossibleComparisons > 0
      ? ((totalComparisons / maxPossibleComparisons) * 100).toFixed(1)
      : '0';

  return (
    <Card className="mt-6">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Algorithm Analytics</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="efficiency">Efficiency Metrics</TabsTrigger>
            <TabsTrigger value="progression">Ranking Progression</TabsTrigger>
            <TabsTrigger value="participation">Horse Analytics</TabsTrigger>
          </TabsList>

          <TabsContent value="efficiency" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border p-3">
                <div className="text-sm text-muted-foreground">Total Races</div>
                <div className="mt-1 text-2xl font-bold">
                  {races.length}{' '}
                  <span className="text-sm font-normal text-muted-foreground">
                    of {theoreticalMinimumRaces} optimal
                  </span>
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-sm text-muted-foreground">
                  Algorithm Efficiency
                </div>
                <div className="mt-1 text-2xl font-bold">
                  {raceEfficiency}%{' '}
                  <span className="text-sm font-normal text-muted-foreground">
                    of optimal
                  </span>
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-sm text-muted-foreground">
                  Races per Horse
                </div>
                <div className="mt-1 text-2xl font-bold">
                  {avgRacesPerHorse.toFixed(1)}{' '}
                  <span className="text-sm font-normal text-muted-foreground">
                    avg
                  </span>
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-sm text-muted-foreground">
                  Comparison Efficiency
                </div>
                <div className="mt-1 text-2xl font-bold">
                  {comparisonEfficiency}%{' '}
                  <span className="text-sm font-normal text-muted-foreground">
                    vs. pairwise
                  </span>
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <h4 className="mb-2 text-sm font-medium">
                  Race Type Distribution
                </h4>
                <div className="h-60">
                  <PieChart
                    data={[
                      {
                        name: 'Preliminary',
                        value: raceTypeCounts['preliminary'] || 0,
                      },
                      {
                        name: 'Championship',
                        value: raceTypeCounts['championship'] || 0,
                      },
                      {
                        name: 'Candidate',
                        value: raceTypeCounts['candidate'] || 0,
                      },
                    ]}
                    colors={['#3b82f6', '#8b5cf6', '#22c55e']}
                  />
                </div>
              </div>

              <div>
                <h4 className="mb-2 text-sm font-medium">
                  Theoretical vs. Actual Races
                </h4>
                <div className="h-60">
                  <BarChart
                    data={[
                      { name: 'Theoretical', value: theoreticalMinimumRaces },
                      { name: 'Actual', value: races.length },
                      {
                        name: 'Naive O(N²)',
                        value: Math.round(
                          (numHorses * numHorses) / (2 * raceSize)
                        ),
                      },
                    ]}
                    xKey="name"
                    colors={['#22c55e', '#3b82f6', '#ef4444']}
                  />
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="progression">
            <div className="space-y-4">
              <div>
                <h4 className="mb-2 text-sm font-medium">
                  Ranking Progression
                </h4>
                <div className="h-80">
                  <LineChart
                    data={raceProgressionData}
                    xKey="race"
                    series={[
                      { key: 'percentComplete', name: 'Actual Progress %' },
                      { key: 'theoreticalIdeal', name: 'Theoretical Ideal %' },
                    ]}
                    colors={['#3b82f6', '#22c55e']}
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-lg border p-3">
                  <div className="text-sm text-muted-foreground">
                    First Horse Ranked After
                  </div>
                  <div className="mt-1 text-2xl font-bold">
                    {Math.ceil(numHorses / raceSize)} races
                  </div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-sm text-muted-foreground">
                    Half Horses Ranked After
                  </div>
                  <div className="mt-1 text-2xl font-bold">
                    {raceProgressionData.findIndex(
                      (d) => d.percentComplete >= 50
                    ) + 1 || 'N/A'}{' '}
                    races
                  </div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-sm text-muted-foreground">
                    Progress Rate
                  </div>
                  <div className="mt-1 text-2xl font-bold">
                    {(finalRanking.length / Math.max(1, races.length)).toFixed(
                      2
                    )}{' '}
                    horses/race
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="participation">
            <div className="space-y-4">
              <div>
                <h4 className="mb-2 text-sm font-medium">
                  Horse Race Participation
                </h4>
                <div className="h-80">
                  <BarChart
                    data={participationData.slice(0, 20)} // Limit to first 20 horses for clarity
                    xKey="horse"
                    series={[{ key: 'races', name: 'Number of Races' }]}
                    colors={['#3b82f6']}
                  />
                </div>
                {numHorses > 20 && (
                  <div className="mt-1 text-center text-xs text-muted-foreground">
                    Showing first 20 horses for clarity
                  </div>
                )}
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-lg border p-3">
                  <div className="text-sm text-muted-foreground">
                    Most Races by a Single Horse
                  </div>
                  <div className="mt-1 text-2xl font-bold">
                    {Math.max(...horseParticipation)} races
                  </div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-sm text-muted-foreground">
                    Horses in Multiple Races
                  </div>
                  <div className="mt-1 text-2xl font-bold">
                    {horseParticipation.filter((p) => p > 1).length}
                    <span className="text-sm font-normal text-muted-foreground">
                      {' '}
                      horses
                    </span>
                  </div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-sm text-muted-foreground">
                    Single Race Horses
                  </div>
                  <div className="mt-1 text-2xl font-bold">
                    {horseParticipation.filter((p) => p === 1).length}
                    <span className="text-sm font-normal text-muted-foreground">
                      {' '}
                      horses
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
