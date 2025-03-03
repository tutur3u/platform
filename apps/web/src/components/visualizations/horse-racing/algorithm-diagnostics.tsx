import { LineChart } from '@/components/ui/charts';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Progress } from '@tuturuuu/ui/progress';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { useMemo } from 'react';

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

interface AlgorithmDiagnosticsProps {
  horses: Horse[];
  races: Race[];
  finalRanking: number[];
  currentRaceIndex: number;
  numHorses: number;
  raceSize: number;
}

export function AlgorithmDiagnostics({
  horses,
  races,
  finalRanking,
  currentRaceIndex,
  numHorses,
  raceSize,
}: AlgorithmDiagnosticsProps) {
  // Calculate theoretical minimum races using log base 2
  const theoreticalMinimum = Math.ceil(
    (numHorses * Math.log2(numHorses)) / Math.log2(raceSize)
  );

  // Calculate percentage of ranking completed
  const rankingProgress = useMemo(() => {
    return (
      (Math.min(finalRanking.length, currentRaceIndex + 1) / numHorses) * 100
    );
  }, [finalRanking.length, currentRaceIndex, numHorses]);

  // Calculate race efficiency - ensure it's properly capped at 100%
  const efficiency = useMemo(() => {
    if (races.length === 0) return 0;
    return Math.min(100, (theoreticalMinimum / races.length) * 100);
  }, [races.length, theoreticalMinimum]);

  // Generate log of algorithm decisions with improved descriptions
  const algorithmLog = useMemo(() => {
    const log: string[] = [];

    races.slice(0, currentRaceIndex + 1).forEach((race, index) => {
      let entry = '';

      switch (race.raceType) {
        case 'preliminary':
          entry = `Race ${index + 1}: Initial grouping of horses ${race.horses.join(', ')}`;
          break;
        case 'championship':
          entry = `Race ${index + 1}: Championship race between group winners ${race.horses.join(', ')}`;
          break;
        case 'candidate':
          // Safely handle optional array access with nullish coalescing
          const firstResult = race.result[0] ?? -1;
          const position = finalRanking.indexOf(firstResult) + 1;
          entry = `Race ${index + 1}: Candidate race to determine position #${position}`;

          if (index > 0 && races[index - 1]?.raceType === 'candidate') {
            const prevRace = races[index - 1];
            const prevWinner = prevRace?.result?.[0] ?? -1;
            const prevPosition = finalRanking.indexOf(prevWinner) + 1;
            entry += ` (progressing from position #${prevPosition})`;
          }
          break;
      }

      // Handle optional array access safely
      const firstResult = race.result[0] ?? -1;
      const newRank = finalRanking.indexOf(firstResult);

      if (newRank !== -1 && newRank <= index) {
        const horseCurrent = firstResult;
        const horseSpeed = horses
          .find((h) => h.id === horseCurrent)
          ?.speed.toFixed(2);
        entry += ` → Horse #${horseCurrent} (speed: ${horseSpeed}) secured position #${newRank + 1}`;

        if (race.raceType === 'candidate' && race.horses.length > 1) {
          const eliminated = race.horses.filter((id) => id !== horseCurrent);
          if (eliminated.length > 0) {
            entry += `. Eliminated ${eliminated.length} candidate${eliminated.length > 1 ? 's' : ''}: ${eliminated.join(', ')}`;
          }
        }
      }

      log.push(entry);
    });

    return log;
  }, [races, currentRaceIndex, finalRanking, horses]);

  // Generate data for efficiency over time chart with corrected calculations
  const efficiencyChartData = useMemo(() => {
    return races.map((_, index) => {
      const racesDone = index + 1;
      const positionsFound = Math.min(racesDone, finalRanking.length);

      // Theoretical optimal races to find X positions is approximately X*log(n)/log(m)
      const idealRaces =
        positionsFound > 0
          ? Math.ceil(
              (positionsFound * Math.log2(numHorses)) / Math.log2(raceSize)
            )
          : 0;

      return {
        race: racesDone,
        actualRaces: racesDone,
        idealRaces: idealRaces,
        efficiency: Math.min(
          100,
          idealRaces > 0 ? (idealRaces / racesDone) * 100 : 100
        ),
      };
    });
  }, [races, finalRanking.length, numHorses, raceSize]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Algorithm Diagnostics</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <h4 className="mb-2 text-sm font-medium">Real-Time Metrics</h4>
            <div className="space-y-4">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Ranking Progress</span>
                  <span className="text-xs font-medium">
                    {rankingProgress.toFixed(1)}%
                  </span>
                </div>
                <Progress value={rankingProgress} className="h-2" />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>0 horses</span>
                  <span>
                    {finalRanking.length} of {numHorses} ranked
                  </span>
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Algorithm Efficiency</span>
                  <span
                    className={`text-xs font-medium ${
                      efficiency > 80
                        ? 'text-green-600 dark:text-green-400'
                        : efficiency > 60
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-red-600 dark:text-red-400'
                    }`}
                  >
                    {efficiency.toFixed(1)}%
                  </span>
                </div>
                <Progress
                  value={efficiency}
                  className={`h-2 ${
                    efficiency > 80
                      ? 'bg-green-600'
                      : efficiency > 60
                        ? 'bg-amber-600'
                        : 'bg-red-600'
                  }`}
                />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Poor</span>
                  <span>Optimal</span>
                </div>
              </div>

              <div className="mt-2 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Key Metrics:</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-md border p-2">
                    <div className="text-xs text-muted-foreground">
                      Races Completed
                    </div>
                    <div className="text-lg font-semibold">
                      {currentRaceIndex + 1} of {races.length}
                    </div>
                  </div>
                  <div className="rounded-md border p-2">
                    <div className="text-xs text-muted-foreground">
                      Theoretical Optimum
                    </div>
                    <div className="text-lg font-semibold">
                      {theoreticalMinimum} races
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div>
            <h4 className="mb-2 text-sm font-medium">Efficiency Over Time</h4>
            <div className="h-[200px]">
              <LineChart
                data={efficiencyChartData}
                xKey="race"
                series={[{ key: 'efficiency', name: 'Efficiency %' }]}
                colors={['#2563eb']}
              />
            </div>
          </div>

          <div className="md:col-span-2">
            <h4 className="mb-2 text-sm font-medium">Algorithm Decision Log</h4>
            <ScrollArea className="h-[200px] rounded-md border p-2">
              <div className="space-y-1 p-1">
                {algorithmLog.map((log, index) => (
                  <div
                    key={index}
                    className={`rounded-sm p-2 text-xs ${
                      index === currentRaceIndex ? 'bg-muted font-medium' : ''
                    }`}
                  >
                    {log}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
