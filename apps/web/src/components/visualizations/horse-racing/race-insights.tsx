import { AlertCircleIcon, TrendingUpIcon } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';

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

interface RaceInsightsProps {
  horses: Horse[];
  race: Race;
  allRaces: Race[];
  currentRaceIndex: number;
  finalRanking: number[];
}

export function RaceInsights({
  horses,
  race,
  allRaces,
  currentRaceIndex,
  finalRanking,
}: RaceInsightsProps) {
  if (!race) return null;

  // Track horse appearance history
  const horseHistory = new Map<number, number[]>();

  // Build history of horses up to current race
  allRaces.slice(0, currentRaceIndex + 1).forEach((r, raceIndex) => {
    r.horses.forEach((horseId) => {
      if (!horseHistory.has(horseId)) {
        horseHistory.set(horseId, []);
      }
      horseHistory.get(horseId)?.push(raceIndex);
    });
  });

  // Get previous races for each horse in current race
  const previousRaces = race.horses.map((horseId) => {
    const history = horseHistory.get(horseId) || [];
    return history.length > 1 ? history.length - 1 : 0;
  });

  // Calculate speed differentials between adjacent horses
  const speedDifferentials = [] as {
    faster: number;
    slower: number;
    percentDiff: string;
  }[];
  for (let i = 0; i < race.result.length - 1; i++) {
    const currentHorse = horses.find((h) => h.id === race.result[i]);
    const nextHorse = horses.find((h) => h.id === race.result[i + 1]);

    if (currentHorse && nextHorse) {
      const differential =
        ((nextHorse.speed - currentHorse.speed) / currentHorse.speed) * 100;
      speedDifferentials.push({
        faster: currentHorse.id,
        slower: nextHorse.id,
        percentDiff: differential.toFixed(1),
      });
    }
  }

  // Calculate important insights about this race
  const avgSpeed =
    race.horses.reduce((sum, id) => {
      const horse = horses.find((h) => h.id === id);
      return sum + (horse?.speed || 0);
    }, 0) / race.horses.length;

  const fastestHorse = race.result[0];
  const slowestHorse = race.result[race.result.length - 1];

  // Check if this race established a key ranking position
  const establishedRanking =
    fastestHorse !== undefined ? finalRanking.indexOf(fastestHorse) : -1;

  // Determine if there were any upsets (horses with big speed differences finishing close)
  const upsets = speedDifferentials.filter(
    (diff) => parseFloat(diff.percentDiff) < 5
  );

  // Check if any horse in this race has had many previous races
  const veteranHorse = Math.max(...previousRaces) > 2;

  // Determine race significance
  let significance = 'standard';
  if (race.raceType === 'championship') {
    significance = 'major';
  } else if (establishedRanking >= 0 && establishedRanking < 3) {
    significance = 'critical'; // Established top 3 position
  } else if (veteranHorse || upsets.length > 0) {
    significance = 'notable';
  }

  return (
    <Card className="mt-4">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Race Insights</CardTitle>
          <Badge
            variant={
              significance === 'critical'
                ? 'destructive'
                : significance === 'major'
                  ? 'default'
                  : significance === 'notable'
                    ? 'secondary'
                    : 'outline'
            }
            className="text-xs"
          >
            {significance === 'critical'
              ? 'Critical Race'
              : significance === 'major'
                ? 'Major Race'
                : significance === 'notable'
                  ? 'Notable Race'
                  : 'Standard Race'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-3">
            <div>
              <h4 className="mb-1 font-medium text-sm">Race Analysis</h4>
              <div className="text-muted-foreground text-sm">
                {race.horses.length === horses.length ? (
                  <p>
                    This race includes all horses, providing a complete ranking.
                  </p>
                ) : race.raceType === 'championship' ? (
                  <p>
                    Championship race between winners of preliminary groups to
                    determine the overall fastest horse.
                  </p>
                ) : race.raceType === 'candidate' ? (
                  <p>
                    Candidate race to determine the next position in the final
                    ranking.
                  </p>
                ) : (
                  <p>Preliminary race to establish initial group rankings.</p>
                )}

                <div className="mt-2 space-y-1">
                  <div className="flex items-center gap-1 text-xs">
                    <span className="font-medium">Group Avg Speed:</span>{' '}
                    {avgSpeed.toFixed(2)}
                  </div>
                  <div className="flex items-center gap-1 text-xs">
                    <span className="font-medium">Speed Range:</span>{' '}
                    {Math.abs(
                      (horses.find((h) => h.id === slowestHorse)?.speed || 0) -
                        (horses.find((h) => h.id === fastestHorse)?.speed || 0)
                    ).toFixed(2)}
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h4 className="mb-1 font-medium text-sm">Key Observations</h4>
              <ul className="space-y-1.5 text-xs">
                {establishedRanking >= 0 && (
                  <li className="flex items-center gap-1.5">
                    <Badge
                      variant="outline"
                      className="flex h-5 w-5 items-center justify-center p-0"
                    >
                      {establishedRanking + 1}
                    </Badge>
                    <span>
                      Horse #{fastestHorse} secured position #
                      {establishedRanking + 1} in the final ranking
                    </span>
                  </li>
                )}

                {speedDifferentials.length > 0 &&
                  speedDifferentials[0]?.percentDiff && (
                    <li className="flex items-center gap-1.5">
                      <TrendingUpIcon className="h-4 w-4 text-green-500" />
                      <span>
                        Winner was {speedDifferentials[0].percentDiff}% faster
                        than second place
                      </span>
                    </li>
                  )}

                {upsets.length > 0 && (
                  <li className="flex items-center gap-1.5">
                    <AlertCircleIcon className="h-4 w-4 text-amber-500" />
                    <span>
                      {upsets.length} close finish
                      {upsets.length > 1 ? 'es' : ''} with less than 5% speed
                      difference
                    </span>
                  </li>
                )}

                {veteranHorse && (
                  <li className="flex items-center gap-1.5">
                    <Badge variant="secondary" className="text-[10px]">
                      VETERAN
                    </Badge>
                    <span>
                      Includes horses that have participated in multiple
                      previous races
                    </span>
                  </li>
                )}

                {race.raceType === 'championship' && (
                  <li className="flex items-center gap-1.5">
                    <Badge variant="default" className="text-[10px]">
                      CHAMPIONSHIP
                    </Badge>
                    <span>This race determines the overall fastest horse</span>
                  </li>
                )}
              </ul>
            </div>
          </div>

          <div>
            <h4 className="mb-1 font-medium text-sm">Speed Comparison</h4>
            <div className="space-y-2">
              {race.result.map((horseId, index) => {
                const horse = horses.find((h) => h.id === horseId);
                if (!horse) return null;

                return (
                  <div key={horseId} className="flex items-center">
                    <div className="mr-2 w-4 font-medium text-xs">
                      #{index + 1}
                    </div>
                    <div
                      className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] text-white"
                      style={{ backgroundColor: horse.color }}
                    >
                      {horseId}
                    </div>
                    <div className="ml-2 flex-1">
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full bg-linear-to-r from-green-500 to-green-400"
                          style={{
                            width: `${100 - (horse.speed / 10) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                    <div className="ml-2 min-w-10 text-right font-mono text-xs">
                      {horse.speed.toFixed(2)}
                    </div>
                    {index < race.result.length - 1 && (
                      <div className="ml-1 text-muted-foreground text-xs">
                        {speedDifferentials[index] &&
                          parseFloat(speedDifferentials[index].percentDiff) >
                            0 && (
                            <span className="text-muted-foreground">
                              +{speedDifferentials[index].percentDiff}%
                            </span>
                          )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="mt-4 text-muted-foreground text-xs">
          <p>
            Race {currentRaceIndex + 1} of {allRaces.length} •{' '}
            {race.raceType.charAt(0).toUpperCase() + race.raceType.slice(1)}{' '}
            Race
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
