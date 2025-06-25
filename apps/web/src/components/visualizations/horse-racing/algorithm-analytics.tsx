import { Card } from '@tuturuuu/ui/card';
import { Progress } from '@tuturuuu/ui/progress';
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Horse, Race } from './types';

interface AlgorithmAnalyticsProps {
  horses: Horse[];
  races: Race[];
  finalRanking: number[];
  raceSize: number;
  numHorses: number;
  currentRaceIndex: number;
}

export function AlgorithmAnalytics({
  // horses,
  races,
  // finalRanking,
  raceSize,
  numHorses,
  currentRaceIndex,
}: AlgorithmAnalyticsProps) {
  // Calculate theoretical minimum races needed
  const theoreticalMinRaces = Math.ceil(
    (numHorses * Math.log2(numHorses)) / Math.log2(raceSize)
  );

  // Calculate efficiency metrics
  const efficiency = theoreticalMinRaces / races.length;
  const progressPercentage = (currentRaceIndex + 1) / races.length;

  // Calculate race type distribution for chart
  const raceTypeData = [
    {
      type: 'Preliminary',
      count: races.filter((r) => r.raceType === 'preliminary').length,
    },
    {
      type: 'Championship',
      count: races.filter((r) => r.raceType === 'championship').length,
    },
    {
      type: 'Candidate',
      count: races.filter((r) => r.raceType === 'candidate').length,
    },
  ];

  // Calculate information gain per race
  const raceEffectiveness = races.map((race, index) => ({
    race: `Race ${index + 1}`,
    effectiveness: (race.horses.length * (race.horses.length - 1)) / 2, // Maximum possible information gain
    actual: race.result.length - 1, // Actual information gained
  }));

  return (
    <div className="space-y-4">
      {/* Performance Metrics */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="p-4">
          <div className="space-y-2">
            <div className="text-sm font-medium">Algorithm Efficiency</div>
            <div className="text-2xl font-bold">
              {Math.round(efficiency * 100)}%
            </div>
            <Progress value={efficiency * 100} className="h-2" />
            <div className="text-xs text-muted-foreground">
              Based on theoretical minimum of {theoreticalMinRaces} races
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="space-y-2">
            <div className="text-sm font-medium">Progress</div>
            <div className="text-2xl font-bold">
              {Math.round(progressPercentage * 100)}%
            </div>
            <Progress value={progressPercentage * 100} className="h-2" />
            <div className="text-xs text-muted-foreground">
              {currentRaceIndex + 1} of {races.length} races completed
            </div>
          </div>
        </Card>
      </div>

      {/* Race Type Distribution */}
      <Card className="p-4">
        <div className="space-y-3">
          <div className="text-sm font-medium">Race Type Distribution</div>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={raceTypeData}>
                <XAxis dataKey="type" />
                <YAxis />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    color: '#fff',
                  }}
                />
                <Bar dataKey="count" fill="#4ade80" opacity={0.9} />{' '}
                {/* Bright green color */}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </Card>

      {/* Race Effectiveness */}
      <Card className="p-4">
        <div className="space-y-3">
          <div className="text-sm font-medium">Race Effectiveness</div>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={raceEffectiveness}>
                <XAxis dataKey="race" />
                <YAxis />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    color: '#fff',
                  }}
                />
                <Bar
                  dataKey="effectiveness"
                  fill="#a78bfa" /* Purple color */
                  opacity={0.7}
                  name="Potential Information"
                />
                <Bar
                  dataKey="actual"
                  fill="#f97316" /* Orange color */
                  name="Actual Information"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="text-xs text-muted-foreground">
            Shows potential vs actual information gained per race
          </div>
        </div>
      </Card>
    </div>
  );
}
