import { Card, CardContent } from '@tuturuuu/ui/card';
import { ChevronRight } from '@tuturuuu/ui/icons';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { motion } from 'framer-motion';
import { useState } from 'react';

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

interface RaceDetailsProps {
  currentRace: Race;
  horses: Horse[];
  showSpeeds: boolean;
  previousRaces: Race[];
}

export function RaceDetails({
  currentRace,
  horses,
  showSpeeds,
  previousRaces,
}: RaceDetailsProps) {
  const [activeTab, setActiveTab] = useState('results');

  // Get race history for horses in the current race
  const getHorseRaceHistory = (horseId: number) => {
    return previousRaces
      .filter((race) => race.horses.includes(horseId))
      .map((race) => {
        const position = race.result.indexOf(horseId) + 1;
        return {
          raceType: race.raceType,
          position,
          total: race.result.length,
        };
      });
  };

  return (
    <Card className="overflow-hidden">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid h-full w-full grid-cols-1 md:grid-cols-3">
          <TabsTrigger value="results">Results</TabsTrigger>
          <TabsTrigger value="history">Race History</TabsTrigger>
          <TabsTrigger value="stats">Stats</TabsTrigger>
        </TabsList>

        <CardContent className="p-4">
          <TabsContent
            value="results"
            className="mt-0 focus-visible:ring-0 focus-visible:outline-none"
          >
            <div className="space-y-4">
              <div className="space-y-2">
                <h3 className="text-sm font-medium">Race Results</h3>
                <div className="flex flex-wrap items-center gap-1 rounded-md bg-muted/30 p-3">
                  {currentRace.result.map((id, index) => (
                    <motion.div
                      key={id}
                      className="flex items-center duration-300 animate-in fade-in slide-in-from-bottom-2"
                      style={{ animationDelay: `${index * 100}ms` }}
                    >
                      <div
                        className="group relative flex h-12 w-12 items-center justify-center rounded-full text-sm font-bold text-white shadow-sm transition-transform hover:scale-110"
                        style={{
                          backgroundColor: horses.find((h) => h.id === id)
                            ?.color,
                        }}
                      >
                        {id}
                        <div className="absolute -top-6 left-1/2 flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full bg-white/90 text-sm font-semibold shadow-sm dark:bg-slate-800/90">
                          {index + 1}
                        </div>

                        {showSpeeds && (
                          <div className="absolute -bottom-8 left-1/2 z-20 -translate-x-1/2 rounded border bg-background px-1.5 py-0.5 text-xs whitespace-nowrap opacity-0 shadow-md transition-opacity group-hover:opacity-100">
                            Speed:{' '}
                            {horses.find((h) => h.id === id)?.speed.toFixed(1)}
                          </div>
                        )}
                      </div>

                      {index < currentRace.result.length - 1 && (
                        <ChevronRight
                          size={20}
                          className="mx-1 text-muted-foreground"
                        />
                      )}
                    </motion.div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-medium">Participating Horses</h3>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                  {currentRace.horses.map((id) => {
                    const horse = horses.find((h) => h.id === id);
                    const position = currentRace.result.indexOf(id) + 1;

                    if (!horse) return null;

                    return (
                      <div
                        key={id}
                        className={`flex items-center rounded-md border p-2 ${
                          position === 1
                            ? 'border-yellow-400 bg-yellow-50 dark:bg-yellow-900/10'
                            : ''
                        }`}
                      >
                        <div
                          className="mr-3 flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white"
                          style={{
                            backgroundColor: horse.color,
                          }}
                        >
                          {id}
                        </div>

                        <div className="flex flex-col">
                          <span className="text-xs font-medium">
                            Position: {position}/{currentRace.horses.length}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            Speed: {showSpeeds ? horse.speed.toFixed(2) : '???'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="h-2 flex-1 rounded-full bg-gradient-to-r from-green-400 to-red-400 shadow-inner"></div>
                <div className="ml-2 flex items-center gap-1 text-xs font-medium text-muted-foreground">
                  <span className="text-green-600 dark:text-green-500">
                    Faster
                  </span>
                  <span>→</span>
                  <span className="text-red-600 dark:text-red-500">Slower</span>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent
            value="history"
            className="mt-0 focus-visible:ring-0 focus-visible:outline-none"
          >
            <div className="space-y-4">
              <h3 className="text-sm font-medium">Horse Racing History</h3>
              <div className="space-y-1">
                {currentRace.horses.map((horseId) => {
                  const horse = horses.find((h) => h.id === horseId);
                  const history = getHorseRaceHistory(horseId);

                  if (!horse) return null;

                  return (
                    <div key={horseId} className="rounded-md border p-3">
                      <div className="flex items-center gap-2">
                        <div
                          className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white"
                          style={{
                            backgroundColor: horse.color,
                          }}
                        >
                          {horseId}
                        </div>
                        <div className="text-sm font-medium">
                          Horse #{horseId}
                          {showSpeeds && (
                            <span className="ml-1 text-xs text-muted-foreground">
                              (Speed: {horse.speed.toFixed(2)})
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Race history */}
                      <div className="mt-2">
                        <h4 className="mb-1 text-xs text-muted-foreground">
                          Race Performance:
                        </h4>
                        <div className="flex flex-wrap gap-1">
                          {history.map((race, idx) => {
                            let badgeClass =
                              race.raceType === 'preliminary'
                                ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                                : race.raceType === 'championship'
                                  ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300'
                                  : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';

                            return (
                              <div
                                key={idx}
                                className={`rounded px-1.5 py-0.5 text-xs ${badgeClass}`}
                              >
                                {race.position}/{race.total}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Win rate visualization */}
                      {history.length > 0 && (
                        <div className="mt-2">
                          <h4 className="mb-1 text-xs text-muted-foreground">
                            Performance:
                          </h4>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                            {/* First place */}
                            <div
                              className="h-full bg-yellow-400"
                              style={{
                                width: `${(history.filter((r) => r.position === 1).length / history.length) * 100}%`,
                              }}
                            />
                          </div>
                          <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                            <span>
                              First place:{' '}
                              {Math.round(
                                (history.filter((r) => r.position === 1)
                                  .length /
                                  history.length) *
                                  100
                              )}
                              %
                            </span>
                            <span>
                              Avg position:{' '}
                              {(
                                history.reduce(
                                  (acc, r) => acc + r.position,
                                  0
                                ) / history.length
                              ).toFixed(1)}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </TabsContent>

          <TabsContent
            value="stats"
            className="mt-0 focus-visible:ring-0 focus-visible:outline-none"
          >
            <div className="space-y-4">
              <h3 className="text-sm font-medium">Race Statistics</h3>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-md border p-3">
                  <h4 className="mb-2 text-xs font-medium">
                    Speed Distribution
                  </h4>
                  <div className="space-y-2">
                    {currentRace.horses.map((horseId) => {
                      const horse = horses.find((h) => h.id === horseId);
                      if (!horse) return null;

                      const speedPercentage = (horse.speed / 10) * 100;
                      const position = currentRace.result.indexOf(horseId) + 1;

                      return (
                        <div key={horseId} className="space-y-0.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <div
                                className="h-4 w-4 rounded-full"
                                style={{ backgroundColor: horse.color }}
                              />
                              <span className="text-xs">Horse #{horseId}</span>
                            </div>
                            <span className="text-xs font-medium">
                              {position === 1 && '🥇 '}
                              {position === 2 && '🥈 '}
                              {position === 3 && '🥉 '}
                              {showSpeeds ? horse.speed.toFixed(1) : '???'}
                            </span>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                            <div
                              className="h-full"
                              style={{
                                width: `${speedPercentage}%`,
                                backgroundColor: horse.color,
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-md border p-3">
                  <h4 className="mb-2 text-xs font-medium">Race Info</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Race type:</span>
                      <span className="font-medium capitalize">
                        {currentRace.raceType}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        Participants:
                      </span>
                      <span className="font-medium">
                        {currentRace.horses.length} horses
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Avg speed:</span>
                      <span className="font-medium">
                        {showSpeeds
                          ? (
                              currentRace.horses.reduce(
                                (acc, id) =>
                                  acc +
                                  (horses.find((h) => h.id === id)?.speed || 0),
                                0
                              ) / currentRace.horses.length
                            ).toFixed(2)
                          : '???'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Winner:</span>
                      <span className="flex items-center gap-1 font-medium">
                        Horse #{currentRace.result[0]}
                        <div
                          className="h-3 w-3 rounded-full"
                          style={{
                            backgroundColor: horses.find(
                              (h) => h.id === currentRace.result[0]
                            )?.color,
                          }}
                        />
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Speed gap:</span>
                      <span className="font-medium">
                        {showSpeeds
                          ? Math.abs(
                              (horses.find(
                                (h) => h.id === currentRace.result[0]
                              )?.speed || 0) -
                                (horses.find(
                                  (h) =>
                                    h.id ===
                                    currentRace.result[
                                      currentRace.result.length - 1
                                    ]
                                )?.speed || 0)
                            ).toFixed(2)
                          : '???'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>
        </CardContent>
      </Tabs>
    </Card>
  );
}
