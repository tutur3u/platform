'use client';

// Components
import { AlgorithmAnalytics } from './algorithm-analytics';
import { AlgorithmBenchmarks } from './algorithm-benchmarks';
import { AlgorithmDiagnostics } from './algorithm-diagnostics';
import { AlgorithmInsights } from './algorithm-insights';
import { BenchmarkRunner } from './benchmark-runner';
import { ConfigurationPanel } from './configuration-panel';
import { CurrentStandings } from './current-standings';
import Explaination from './explaination';
import { RaceAnimation } from './race-animation';
import { RaceControls } from './race-controls';
import { RaceDetails } from './race-details';
import { RelationshipGraph } from './relationship-graph';
// Utils
import { findHorseRanking } from '@/utils/horseRacing';
import { HorseRacingBenchmark } from '@/utils/horseRacingBenchmarks';
// UI Components
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent } from '@tuturuuu/ui/card';
import { Separator } from '@tuturuuu/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
// Icons
import { ChevronUp, Lightbulb } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';

// Types
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

// Constants
const COLORS = [
  '#FF5733',
  '#33FF57',
  '#3357FF',
  '#F033FF',
  '#FF33A8',
  '#33FFF0',
  '#FFD133',
  '#33FFBD',
  '#8C33FF',
  '#FF8C33',
  '#33FF8C',
  '#FF33F0',
  '#33C4FF',
  '#FF3333',
  '#33FF33',
  '#6E33FF',
  '#FFB633',
  '#33FFE8',
  '#FF6E33',
  '#33FF6E',
  '#E33FFF',
  '#FF3366',
  '#33CCFF',
  '#FFCC33',
  '#33FF99',
  '#9933FF',
  '#FF9933',
  '#66FF33',
  '#3366FF',
  '#FF6666',
  '#66FF66',
  '#6666FF',
  '#FFAA33',
  '#33FFAA',
  '#AA33FF',
];

export function HorseRacingVisualization() {
  // Configuration state
  const [numHorses, setNumHorses] = useState(10);
  const [raceSize, setRaceSize] = useState(3);
  const [horses, setHorses] = useState<Horse[]>([]);
  const [speedDistribution, setSpeedDistribution] = useState<
    'uniform' | 'normal' | 'exponential' | 'clustered'
  >('uniform');
  const [animationSpeed, setAnimationSpeed] = useState(1000);
  const [showHorseSpeeds, setShowHorseSpeeds] = useState(true);
  const [showAnimation, setShowAnimation] = useState(true);

  // Visualization state
  const [races, setRaces] = useState<Race[]>([]);
  const [currentRaceIndex, setCurrentRaceIndex] = useState(-1);
  const [finalRanking, setFinalRanking] = useState<number[]>([]);
  const [isAnimating, setIsAnimating] = useState(false);
  const [activeTab, setActiveTab] = useState('visualization');
  const [activeInfoTab, setActiveInfoTab] = useState<
    | 'standings'
    | 'relationships'
    | 'details'
    | 'analytics'
    | 'diagnostics'
    | 'insights'
    | 'benchmarks'
  >('standings');
  const [showExplanations, setShowExplanations] = useState(true);
  const [benchmarks, setBenchmarks] = useState<HorseRacingBenchmark[]>([]);

  // Track the relationships between horses for visualization
  const fasterThanRelationships = useRef(
    new Map<number, Set<number>>()
  ).current;
  const slowerThanRelationships = useRef(
    new Map<number, Set<number>>()
  ).current;

  // Animation timer
  const timerRef = useRef<NodeJS.Timeout | undefined>(undefined);

  // Memoized value for whether the visualization is currently running
  const isRunning = useMemo(() => {
    return races.length > 0 && currentRaceIndex < races.length - 1;
  }, [races.length, currentRaceIndex]);

  // Generate custom horses based on the selected distribution
  const generateCustomHorses = (
    count: number,
    distributionType:
      | 'uniform'
      | 'normal'
      | 'exponential'
      | 'clustered' = 'uniform'
  ) => {
    const newHorses: Horse[] = [];

    // Reset relationship tracking
    fasterThanRelationships.clear();
    slowerThanRelationships.clear();

    // Generate speeds based on distribution type
    for (let i = 0; i < count; i++) {
      let speed: number;

      switch (distributionType) {
        case 'normal':
          // Bell curve distribution around 5.5
          const u1 = Math.random();
          const u2 = Math.random();
          const z0 =
            Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
          speed = 5.5 + 1.5 * z0; // Mean 5.5, SD 1.5
          speed = Math.max(1, Math.min(10, speed)); // Clamp between 1-10
          break;

        case 'exponential':
          // Exponential distribution - many slow horses, few fast ones
          speed = -2 * Math.log(1 - Math.random());
          speed = Math.max(1, Math.min(10, speed)); // Clamp between 1-10
          break;

        case 'clustered':
          // Three clusters of speeds (fast, medium, slow)
          const cluster = Math.floor(Math.random() * 3);
          if (cluster === 0) {
            speed = 1 + Math.random() * 2; // Fast: 1-3
          } else if (cluster === 1) {
            speed = 4 + Math.random() * 3; // Medium: 4-7
          } else {
            speed = 8 + Math.random() * 2; // Slow: 8-10
          }
          break;

        case 'uniform':
        default:
          // Uniform distribution (default)
          speed = Math.random() * 9 + 1; // Random speed between 1 and 10
      }

      newHorses.push({
        id: i,
        speed: speed,
        color: COLORS[i % COLORS.length]!,
      });

      // Initialize relationship tracking for this horse
      fasterThanRelationships.set(i, new Set<number>());
      slowerThanRelationships.set(i, new Set<number>());
    }

    return newHorses;
  };

  // Initialize horses with the selected distribution when parameters change
  useMemo(() => {
    setHorses(generateCustomHorses(numHorses, speedDistribution));
  }, [numHorses, speedDistribution]);

  // Reset the visualization and regenerate horses
  const regenerateHorses = () => {
    const newHorses = generateCustomHorses(numHorses, speedDistribution);
    setHorses(newHorses);
    setRaces([]);
    setCurrentRaceIndex(-1);
    setFinalRanking([]);
  };

  // Update relationship tracking after a race
  const updateRelationships = (raceResult: number[]) => {
    // For each pair of horses in the race result, update their relationships
    for (let i = 0; i < raceResult.length; i++) {
      const fasterId = raceResult[i];

      for (let j = i + 1; j < raceResult.length; j++) {
        const slowerId = raceResult[j];

        // Direct relationship: faster beats slower
        fasterThanRelationships.get(fasterId!)?.add(slowerId!);
        slowerThanRelationships.get(slowerId!)?.add(fasterId!);

        // Transitive relationships: if A > B and B > C, then A > C
        const inferredFasterThan = new Set([
          ...(fasterThanRelationships.get(slowerId!) || []),
        ]);

        for (const inferredSlower of inferredFasterThan) {
          fasterThanRelationships.get(fasterId!)?.add(inferredSlower);
          slowerThanRelationships.get(inferredSlower!)?.add(fasterId!);
        }

        // If B < A and C < B, then C < A
        const inferredSlowerThan = new Set([
          ...(slowerThanRelationships.get(fasterId!) || []),
        ]);

        for (const inferredFaster of inferredSlowerThan) {
          slowerThanRelationships.get(slowerId!)?.add(inferredFaster);
          fasterThanRelationships.get(inferredFaster!)?.add(slowerId!);
        }
      }
    }
  };

  // Race function for the algorithm
  const raceFunction = (
    horseIds: number[],
    raceType: 'preliminary' | 'championship' | 'candidate' = 'preliminary',
    description: string = ''
  ) => {
    // Sort by speed (fastest first, lower is faster)
    const result = [...horseIds].sort((a, b) => {
      const horseA = horses.find((h) => h.id === a)!;
      const horseB = horses.find((h) => h.id === b)!;
      return horseA.speed - horseB.speed;
    });

    // Update relationship tracking
    updateRelationships(result);

    // Store the race for visualization
    setRaces((prev) => [
      ...prev,
      {
        horses: horseIds,
        result,
        raceType,
        raceDescription: description || `Race ${prev.length + 1}`,
      },
    ]);

    return result;
  };

  // Custom wrapper for the findHorseRanking function
  const findRanking = () => {
    // Define a wrapper function that adds context about each race
    const wrappedRaceFunction = (horseIds: number[]) => {
      // Determine race type based on patterns
      let raceType: 'preliminary' | 'championship' | 'candidate' =
        'preliminary';
      let description = '';

      const currentRaceCount = races.length;

      if (currentRaceCount < Math.ceil(numHorses / raceSize)) {
        raceType = 'preliminary';
        description = `Preliminary Group ${currentRaceCount + 1}`;
      } else if (currentRaceCount === Math.ceil(numHorses / raceSize)) {
        raceType = 'championship';
        description = 'Championship Race (Group Winners)';
      } else {
        raceType = 'candidate';
        description = 'Candidate Race for Next Position';
      }

      return raceFunction(horseIds, raceType, description);
    };

    // Call the actual algorithm with our wrapped function
    return findHorseRanking(numHorses, raceSize, wrappedRaceFunction);
  };

  const resetState = () => {
    setRaces([]);
    setCurrentRaceIndex(-1);
    setFinalRanking([]);
  };

  // Start the visualization
  const startVisualization = () => {
    // Reset state
    setRaces([]);
    setCurrentRaceIndex(-1);
    setFinalRanking([]);

    // Clear relationship tracking
    horses.forEach((horse) => {
      fasterThanRelationships.set(horse.id, new Set<number>());
      slowerThanRelationships.set(horse.id, new Set<number>());
    });

    // Get the ranking using the algorithm
    const ranking = findRanking();
    setFinalRanking(ranking);

    // Begin animation
    setIsAnimating(true);
    setCurrentRaceIndex(0);
  };

  // Toggle play/pause
  const togglePlayPause = () => {
    // Don't allow toggling if we're at the end
    if (currentRaceIndex >= races.length - 1) {
      setIsAnimating(false);
      return;
    }
    setIsAnimating((prev) => !prev);
  };

  // Reset visualization
  const resetVisualization = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    setIsAnimating(false);
    setCurrentRaceIndex(-1);
  };

  // Animation effect for race progression
  useMemo(() => {
    // Clear any existing timer
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }

    // Only set up new timer if animation is running and we're not at the end
    if (isAnimating && currentRaceIndex < races.length - 1) {
      timerRef.current = setTimeout(() => {
        setCurrentRaceIndex((prev) => prev + 1);
      }, animationSpeed + 800); // Add delay for animation countdown
    }

    // Clean up on unmount or state change
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [isAnimating, currentRaceIndex, races.length, animationSpeed]);

  // Handle race completion
  const handleRaceComplete = () => {
    // If we're at the last race or not animating, do nothing
    if (currentRaceIndex >= races.length - 1 || !isAnimating) {
      return;
    }
  };

  // Navigate to a specific race
  const navigateToRace = (index: number) => {
    if (index >= 0 && index < races.length) {
      setCurrentRaceIndex(index);
    }
  };

  // Handle a benchmark selection
  const handleBenchmarkSelect = (horses: number, raceSize: number) => {
    if (isRunning) {
      resetVisualization();
    }

    setNumHorses(horses);
    setRaceSize(raceSize);
    resetState();
  };

  // Handle benchmarks update from the runner
  const handleBenchmarksUpdated = (
    updatedBenchmarks: HorseRacingBenchmark[]
  ) => {
    // Only update the benchmarks state if it's actually different
    // This prevents the infinite update loop
    if (JSON.stringify(benchmarks) !== JSON.stringify(updatedBenchmarks)) {
      setBenchmarks(updatedBenchmarks);
    }
  };

  // Get currently visible race data
  const currentRace = races[currentRaceIndex];
  const previousRaces = races.slice(0, currentRaceIndex);

  return (
    <div className="space-y-6">
      <Tabs
        defaultValue="visualization"
        value={activeTab}
        onValueChange={setActiveTab}
      >
        <TabsList className="grid h-full w-full grid-cols-1 md:grid-cols-3">
          <TabsTrigger value="visualization">Visualization</TabsTrigger>
          <TabsTrigger value="benchmarks">Benchmarks</TabsTrigger>
          <TabsTrigger value="explanation">Algorithm Explanation</TabsTrigger>
        </TabsList>

        <TabsContent value="visualization" className="mt-4 space-y-6">
          {/* Configuration Panel */}
          <ConfigurationPanel
            numHorses={numHorses}
            setNumHorses={setNumHorses}
            raceSize={raceSize}
            setRaceSize={(value) => {
              resetState();
              setRaceSize(value);
            }}
            animationSpeed={animationSpeed}
            setAnimationSpeed={setAnimationSpeed}
            speedDistribution={speedDistribution}
            setSpeedDistribution={setSpeedDistribution}
            showAnimation={showAnimation}
            setShowAnimation={setShowAnimation}
            showHorseSpeeds={showHorseSpeeds}
            setShowHorseSpeeds={(value) => {
              resetState();
              setShowHorseSpeeds(value);
            }}
            regenerateHorses={regenerateHorses}
            isRunning={isRunning}
          />

          {/* Main Visualization Area */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Left column: Controls and Animation */}
            <div className="space-y-4">
              <Card>
                <CardContent className="p-4">
                  <RaceControls
                    races={races}
                    currentRaceIndex={currentRaceIndex}
                    isRunning={isRunning}
                    isAnimating={isAnimating}
                    startVisualization={startVisualization}
                    togglePlayPause={togglePlayPause}
                    resetVisualization={resetVisualization}
                    navigateToRace={navigateToRace}
                    animationSpeed={animationSpeed}
                    setAnimationSpeed={setAnimationSpeed}
                  />
                </CardContent>
              </Card>

              {/* Current Race Animation */}
              {showAnimation && currentRace && (
                <RaceAnimation
                  horses={horses}
                  raceHorses={currentRace.horses}
                  onRaceComplete={handleRaceComplete}
                  animationSpeed={animationSpeed}
                  showSpeeds={showHorseSpeeds}
                />
              )}

              {/* Race Details (only shown when a race is selected) */}
              {currentRace && (
                <RaceDetails
                  currentRace={currentRace}
                  horses={horses}
                  showSpeeds={showHorseSpeeds}
                  previousRaces={previousRaces}
                />
              )}
            </div>

            {/* Right column: Current Standings and Other Info */}
            <div className="space-y-4">
              {/* Secondary Information Tabs */}
              <Card>
                <CardContent className="p-0">
                  <Tabs
                    value={activeInfoTab}
                    onValueChange={(value) => setActiveInfoTab(value as any)}
                    className="w-full"
                  >
                    <TabsList className="grid h-full w-full grid-cols-2 sm:grid-cols-3 lg:grid-cols-7">
                      <TabsTrigger value="standings">Standings</TabsTrigger>
                      <TabsTrigger value="relationships">Network</TabsTrigger>
                      <TabsTrigger value="insights">Insights</TabsTrigger>
                      <TabsTrigger value="details">Details</TabsTrigger>
                      <TabsTrigger value="analytics">Analytics</TabsTrigger>
                      <TabsTrigger value="diagnostics">Diagnostics</TabsTrigger>
                      <TabsTrigger value="benchmarks">Benchmarks</TabsTrigger>
                    </TabsList>

                    <div className="p-4">
                      {/* Standings Tab */}
                      <TabsContent value="standings" className="mt-0 space-y-4">
                        <CurrentStandings
                          horses={horses}
                          finalRanking={finalRanking}
                          currentRaceIndex={currentRaceIndex}
                          fasterThanRelationships={fasterThanRelationships}
                          slowerThanRelationships={slowerThanRelationships}
                        />
                      </TabsContent>

                      {/* Relationships Tab */}
                      <TabsContent
                        value="relationships"
                        className="mt-0 space-y-4"
                      >
                        <RelationshipGraph
                          horses={horses}
                          fasterThanRelationships={fasterThanRelationships}
                          slowerThanRelationships={slowerThanRelationships}
                          finalRanking={finalRanking}
                          currentRaceIndex={currentRaceIndex}
                        />
                      </TabsContent>

                      {/* Insights Tab */}
                      <TabsContent value="insights" className="mt-0">
                        {races.length > 0 ? (
                          <AlgorithmInsights
                            horses={horses}
                            races={races}
                            currentRaceIndex={currentRaceIndex}
                            fasterThanRelationships={fasterThanRelationships}
                            slowerThanRelationships={slowerThanRelationships}
                            finalRanking={finalRanking}
                          />
                        ) : (
                          <div className="flex h-40 items-center justify-center text-muted-foreground">
                            Start the visualization to see algorithm insights
                          </div>
                        )}
                      </TabsContent>

                      {/* Details Tab */}
                      <TabsContent value="details" className="mt-0 space-y-4">
                        {races.length > 0 ? (
                          <div className="space-y-4">
                            <h3 className="text-lg font-medium">
                              Horse Details
                            </h3>
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
                              {horses.map((horse) => (
                                <div
                                  key={horse.id}
                                  className="rounded-md border p-3"
                                >
                                  <div className="flex items-center gap-2">
                                    <div
                                      className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white"
                                      style={{ backgroundColor: horse.color }}
                                    >
                                      {horse.id}
                                    </div>
                                    <div>
                                      <div className="text-sm font-medium">
                                        Horse #{horse.id}
                                      </div>
                                      <div className="text-xs text-muted-foreground">
                                        Speed:{' '}
                                        {showHorseSpeeds
                                          ? horse.speed.toFixed(2)
                                          : '???'}
                                      </div>
                                    </div>
                                  </div>

                                  {/* Show current position if known */}
                                  {finalRanking.includes(horse.id) &&
                                    finalRanking.indexOf(horse.id) <=
                                      currentRaceIndex && (
                                      <div className="mt-2 flex items-center rounded-md bg-muted/50 px-2 py-1 text-xs">
                                        <span className="font-medium">
                                          Position: #
                                          {finalRanking.indexOf(horse.id) + 1}
                                        </span>
                                      </div>
                                    )}
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="flex h-40 items-center justify-center text-muted-foreground">
                            Start the visualization to see horse details
                          </div>
                        )}
                      </TabsContent>

                      {/* Analytics Tab */}
                      <TabsContent value="analytics" className="mt-0">
                        {races.length > 0 ? (
                          <AlgorithmAnalytics
                            horses={horses}
                            races={races}
                            finalRanking={finalRanking}
                            raceSize={raceSize}
                            numHorses={numHorses}
                            currentRaceIndex={currentRaceIndex}
                          />
                        ) : (
                          <div className="flex h-40 items-center justify-center text-muted-foreground">
                            Start the visualization to see analytics
                          </div>
                        )}
                      </TabsContent>

                      {/* Diagnostics Tab */}
                      <TabsContent value="diagnostics" className="mt-0">
                        {races.length > 0 ? (
                          <AlgorithmDiagnostics
                            horses={horses}
                            races={races}
                            finalRanking={finalRanking}
                            currentRaceIndex={currentRaceIndex}
                            numHorses={numHorses}
                            raceSize={raceSize}
                          />
                        ) : (
                          <div className="flex h-40 items-center justify-center text-muted-foreground">
                            Start the visualization to see diagnostics
                          </div>
                        )}
                      </TabsContent>

                      {/* Benchmarks Tab */}
                      <TabsContent value="benchmarks" className="mt-0">
                        <AlgorithmBenchmarks
                          currentHorses={numHorses}
                          currentRaceSize={raceSize}
                          onSelectBenchmark={
                            isRunning ? undefined : handleBenchmarkSelect
                          }
                          customBenchmarks={benchmarks}
                        />
                      </TabsContent>
                    </div>
                  </Tabs>
                </CardContent>
              </Card>

              {/* Insights and Explanations */}
              {showExplanations && (
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Lightbulb className="h-5 w-5 text-amber-500" />
                        <h3 className="text-sm font-medium">
                          Current Insights
                        </h3>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowExplanations(!showExplanations)}
                        className="h-8 w-8 p-0"
                      >
                        <ChevronUp className="h-4 w-4" />
                      </Button>
                    </div>
                    <Separator className="my-2" />

                    {currentRaceIndex >= 0 ? (
                      <div className="space-y-2 text-sm">
                        <p>
                          {currentRace?.raceType === 'preliminary' && (
                            <>
                              <span className="font-medium">
                                Preliminary race:
                              </span>{' '}
                              Establishing initial rankings within groups.
                            </>
                          )}
                          {currentRace?.raceType === 'championship' && (
                            <>
                              <span className="font-medium">
                                Championship race:
                              </span>{' '}
                              Finding the overall fastest horse from group
                              winners.
                            </>
                          )}
                          {currentRace?.raceType === 'candidate' && (
                            <>
                              <span className="font-medium">
                                Candidate race:
                              </span>{' '}
                              Finding the next fastest horse in the overall
                              ranking.
                            </>
                          )}
                        </p>

                        <p>
                          {currentRaceIndex < finalRanking.length ? (
                            <>
                              So far, we've determined{' '}
                              {
                                finalRanking.slice(0, currentRaceIndex + 1)
                                  .length
                              }{' '}
                              positions out of {numHorses} horses (
                              {Math.round(
                                ((currentRaceIndex + 1) / numHorses) * 100
                              )}
                              %).
                            </>
                          ) : (
                            <>
                              All {numHorses} horse positions have been
                              determined.
                            </>
                          )}
                        </p>

                        {currentRaceIndex > 0 &&
                          currentRaceIndex < races.length - 1 && (
                            <p className="text-muted-foreground">
                              Completed {currentRaceIndex + 1} out of{' '}
                              {races.length} total races (
                              {Math.round(
                                ((currentRaceIndex + 1) / races.length) * 100
                              )}
                              % complete).
                            </p>
                          )}
                      </div>
                    ) : (
                      <div className="py-2 text-center text-sm text-muted-foreground">
                        Start the visualization to see insights
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        {/* Benchmarks Tab */}
        <TabsContent value="benchmarks" className="mt-4">
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">
                Algorithm Benchmarks
              </h2>
              <p className="text-muted-foreground">
                Performance metrics for the Horse Racing Ranking Algorithm
                across different configurations.
              </p>
            </div>

            <BenchmarkRunner onBenchmarksUpdated={handleBenchmarksUpdated} />

            <Card>
              <CardContent className="p-6">
                <h3 className="mb-4 text-lg font-medium">
                  Understanding the Metrics
                </h3>
                <div className="space-y-4 text-sm">
                  <div>
                    <h4 className="font-medium">Races</h4>
                    <p className="text-muted-foreground">
                      The number of races required to determine the complete
                      ranking of all horses.
                    </p>
                  </div>

                  <div>
                    <h4 className="font-medium">Theoretical Minimum</h4>
                    <p className="text-muted-foreground">
                      The lower bound on the number of races needed, based on
                      information theory. Calculated as
                      max(ceil(log_raceSize(horses)), ceil(horses/raceSize)).
                    </p>
                  </div>

                  <div>
                    <h4 className="font-medium">Theoretical Maximum</h4>
                    <p className="text-muted-foreground">
                      The upper bound on the number of races needed, based on
                      naive comparison. Calculated as (horses - 1) in a naive
                      implementation.
                    </p>
                  </div>

                  <div>
                    <h4 className="font-medium">Efficiency</h4>
                    <p className="text-muted-foreground">
                      A measure of how close the algorithm gets to the
                      theoretical optimum. Calculated as (theoreticalMaximum -
                      races) / (theoreticalMaximum - theoreticalMinimum). Higher
                      values indicate better performance.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="explanation" className="mt-4">
          <Explaination />
        </TabsContent>
      </Tabs>
    </div>
  );
}
