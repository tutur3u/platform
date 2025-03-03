'use client';

import { AlgorithmAnalytics } from './algorithm-analytics';
import { AlgorithmDiagnostics } from './algorithm-diagnostics';
import { ConfigurationPanel } from './configuration-panel';
import { HorseDetails } from './horse-details';
import { RaceAnimation } from './race-animation';
import { RaceInsights } from './race-insights';
import { findHorseRanking } from '@/utils/horseRacing';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Crown,
  Medal,
  PauseIcon,
  Play,
  RefreshCw,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

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
];

export function HorseRacingVisualization() {
  const [numHorses, setNumHorses] = useState(10);
  const [raceSize, setRaceSize] = useState(3);
  const [horses, setHorses] = useState<Horse[]>([]);
  const [races, setRaces] = useState<Race[]>([]);
  const [currentRaceIndex, setCurrentRaceIndex] = useState(-1);
  const [finalRanking, setFinalRanking] = useState<number[]>([]);
  const [isAnimating, setIsAnimating] = useState(false);
  const [animationSpeed, setAnimationSpeed] = useState(1000); // milliseconds
  const [activeTab, setActiveTab] = useState('visualization');
  const [showHorseSpeeds, setShowHorseSpeeds] = useState(false);
  const [speedDistribution, setSpeedDistribution] = useState<
    'uniform' | 'normal' | 'exponential' | 'clustered'
  >('uniform');
  const [showAnimation, setShowAnimation] = useState(true);
  const [activeInfoTab, setActiveInfoTab] = useState<
    'rankings' | 'horses' | 'stats' | 'analytics' | 'diagnostics'
  >('rankings');

  // Add a ref to track the animation timer
  const timerRef = useRef<NodeJS.Timeout | undefined>(undefined);

  // Custom speed generation
  const generateCustomHorses = (
    count: number,
    distributionType:
      | 'uniform'
      | 'normal'
      | 'exponential'
      | 'clustered' = 'uniform'
  ) => {
    const newHorses: Horse[] = [];

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
    }

    return newHorses;
  };

  // Initialize horses with the selected distribution
  useEffect(() => {
    setHorses(generateCustomHorses(numHorses, speedDistribution));
  }, [numHorses, speedDistribution]);

  // Reset the visualization and regenerate horses
  const regenerateHorses = () => {
    setHorses(generateCustomHorses(numHorses, speedDistribution));
    setRaces([]);
    setCurrentRaceIndex(-1);
    setFinalRanking([]);
  };

  // Race function for the algorithm
  const raceFunction = (
    horseIds: number[],
    raceType: 'preliminary' | 'championship' | 'candidate' = 'preliminary',
    description: string = ''
  ) => {
    // Sort by speed (fastest first)
    const result = [...horseIds].sort((a, b) => {
      const horseA = horses.find((h) => h.id === a)!;
      const horseB = horses.find((h) => h.id === b)!;
      return horseA.speed - horseB.speed; // Lower speed is faster
    });

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

  // Start the visualization
  const startVisualization = () => {
    // Reset state
    setRaces([]);
    setCurrentRaceIndex(-1);
    setFinalRanking([]);

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

  // Animation effect
  useEffect(() => {
    // Clear any existing timer when the effect runs
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    // Only set up new timer if animation is running and we're not at the end
    if (isAnimating && currentRaceIndex < races.length - 1) {
      timerRef.current = setTimeout(() => {
        setCurrentRaceIndex((prev) => prev + 1);
      }, animationSpeed);
    }

    // Cleanup function to clear timer
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [isAnimating, currentRaceIndex, races.length, animationSpeed]);

  // Efficiently determine theoretical minimum races
  const theoreticalMinimumRaces = useMemo(() => {
    // The theoretical minimum is actually closer to N log_2(N) / log_2(M)
    return Math.ceil((numHorses * Math.log2(numHorses)) / Math.log2(raceSize));
  }, [numHorses, raceSize]);

  // Get race type badge styling
  const getRaceTypeStyles = (
    type: 'preliminary' | 'championship' | 'candidate'
  ) => {
    switch (type) {
      case 'preliminary':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
      case 'championship':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300';
      case 'candidate':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
    }
  };

  // Handle race animation completion
  const handleRaceComplete = () => {
    // If we're at the last race, stop the animation
    if (currentRaceIndex >= races.length - 1) {
      setIsAnimating(false);
      return;
    }

    // Only advance if we're still animating
    if (isAnimating) {
      setCurrentRaceIndex((prev) => prev + 1);
    }
  };

  // Check if visualization is currently running
  const isRunning = races.length > 0 && currentRaceIndex < races.length - 1;

  // Race navigation functions
  const navigateToRace = (index: number) => {
    if (index >= 0 && index < races.length) {
      setCurrentRaceIndex(index);
    }
  };

  const goToFirstRace = () => navigateToRace(0);
  const goToPreviousRace = () => navigateToRace(currentRaceIndex - 1);
  const goToNextRace = () => navigateToRace(currentRaceIndex + 1);
  const goToLastRace = () => navigateToRace(races.length - 1);

  return (
    <div className="space-y-8">
      <Tabs
        defaultValue="visualization"
        value={activeTab}
        onValueChange={setActiveTab}
      >
        <TabsList>
          <TabsTrigger value="visualization">Visualization</TabsTrigger>
          <TabsTrigger value="explanation">Algorithm Explanation</TabsTrigger>
        </TabsList>

        <TabsContent value="visualization" className="mt-4 space-y-6">
          {/* Configuration Panel */}
          <ConfigurationPanel
            numHorses={numHorses}
            setNumHorses={setNumHorses}
            raceSize={raceSize}
            setRaceSize={setRaceSize}
            animationSpeed={animationSpeed}
            setAnimationSpeed={setAnimationSpeed}
            speedDistribution={speedDistribution}
            setSpeedDistribution={setSpeedDistribution}
            showAnimation={showAnimation}
            setShowAnimation={setShowAnimation}
            showHorseSpeeds={showHorseSpeeds}
            setShowHorseSpeeds={setShowHorseSpeeds}
            regenerateHorses={regenerateHorses}
            isRunning={isRunning}
          />

          {/* Race Controls and Visualization */}
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-4">
              <Card className="p-4">
                <CardHeader className="px-0 pt-0 pb-2">
                  <CardTitle className="text-lg">Race Controls</CardTitle>
                </CardHeader>
                <CardContent className="px-0 py-0">
                  <div className="mb-4 flex flex-wrap gap-2">
                    <Button
                      onClick={startVisualization}
                      disabled={isRunning}
                      variant="default"
                      size="lg"
                    >
                      <Play size={16} className="mr-2" />
                      Start
                    </Button>
                    <Button
                      variant="outline"
                      onClick={togglePlayPause}
                      disabled={
                        races.length === 0 ||
                        currentRaceIndex >= races.length - 1
                      }
                      size="lg"
                    >
                      {isAnimating ? (
                        <PauseIcon size={16} className="mr-2" />
                      ) : (
                        <Play size={16} className="mr-2" />
                      )}
                      {isAnimating ? 'Pause' : 'Play'}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={resetVisualization}
                      disabled={races.length === 0}
                    >
                      <RefreshCw size={16} className="mr-1" />
                      Reset
                    </Button>
                  </div>

                  {races.length > 0 && (
                    <>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span>Race Progress:</span>
                          <span className="font-medium">
                            {currentRaceIndex + 1} of {races.length} races
                          </span>
                        </div>

                        <div className="mt-2 flex items-center gap-1">
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={goToFirstRace}
                            disabled={currentRaceIndex <= 0}
                            className="h-8 w-8"
                          >
                            <ChevronsLeft size={16} />
                          </Button>

                          <Button
                            variant="outline"
                            size="icon"
                            onClick={goToPreviousRace}
                            disabled={currentRaceIndex <= 0}
                            className="h-8 w-8"
                          >
                            <ChevronLeft size={16} />
                          </Button>

                          <div
                            className="group relative h-2 flex-1 cursor-pointer overflow-hidden rounded-full bg-muted"
                            onClick={(e) => {
                              const rect =
                                e.currentTarget.getBoundingClientRect();
                              const offsetX = e.clientX - rect.left;
                              const percentage = offsetX / rect.width;
                              const targetRace = Math.max(
                                0,
                                Math.min(
                                  Math.floor(percentage * races.length),
                                  races.length - 1
                                )
                              );
                              navigateToRace(targetRace);
                            }}
                          >
                            <div
                              className="h-full bg-primary transition-all duration-300"
                              style={{
                                width: `${Math.min(100, ((currentRaceIndex + 1) / races.length) * 100)}%`,
                              }}
                            />
                            <div className="absolute -bottom-5 flex w-full justify-between text-xs text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                              <span>1</span>
                              <span>{races.length}</span>
                            </div>
                          </div>

                          <Button
                            variant="outline"
                            size="icon"
                            onClick={goToNextRace}
                            disabled={currentRaceIndex >= races.length - 1}
                            className="h-8 w-8"
                          >
                            <ChevronRight size={16} />
                          </Button>

                          <Button
                            variant="outline"
                            size="icon"
                            onClick={goToLastRace}
                            disabled={currentRaceIndex >= races.length - 1}
                            className="h-8 w-8"
                          >
                            <ChevronsRight size={16} />
                          </Button>
                        </div>

                        {/* Race slider with labels */}
                        <div className="mt-6">
                          <div className="mb-2 text-sm font-medium">
                            Race Timeline:
                          </div>
                          <div className="relative">
                            <div className="absolute top-3 h-1 w-full bg-muted"></div>
                            {races.map((race, idx) => {
                              // Generate markers for key races only to avoid cluttering
                              const isKeyRace =
                                race.raceType !== 'preliminary' ||
                                idx === 0 ||
                                idx === races.length - 1 ||
                                idx %
                                  Math.max(1, Math.floor(races.length / 10)) ===
                                  0;

                              if (!isKeyRace) return null;

                              const position = `${(idx / (races.length - 1)) * 100}%`;
                              const isCurrentRace = idx === currentRaceIndex;

                              return (
                                <div
                                  key={idx}
                                  className={`absolute -translate-x-1/2 transform cursor-pointer ${isCurrentRace ? 'z-10' : ''}`}
                                  style={{ left: position }}
                                  onClick={() => navigateToRace(idx)}
                                >
                                  <div
                                    className={`flex h-6 w-6 items-center justify-center rounded-full ${
                                      isCurrentRace
                                        ? 'scale-110 border-2 border-background bg-primary text-primary-foreground shadow-lg'
                                        : race.raceType === 'preliminary'
                                          ? 'bg-muted hover:bg-muted-foreground/20'
                                          : race.raceType === 'championship'
                                            ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/70 dark:text-purple-300'
                                            : 'bg-green-100 text-green-800 dark:bg-green-900/70 dark:text-green-300'
                                    }`}
                                  >
                                    {race.raceType === 'preliminary' ? (
                                      <span className="text-[10px]">
                                        {idx + 1}
                                      </span>
                                    ) : race.raceType === 'championship' ? (
                                      <Crown size={12} />
                                    ) : (
                                      <Medal size={12} />
                                    )}
                                  </div>
                                  {isCurrentRace && (
                                    <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 transform rounded border bg-background px-1.5 py-0.5 text-xs font-medium whitespace-nowrap">
                                      Race {idx + 1}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>

            <div>
              <Card className="h-full overflow-hidden p-4">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-sm font-medium">
                    {currentRaceIndex >= 0 && currentRaceIndex < races.length
                      ? `Race ${currentRaceIndex + 1} of ${races.length}`
                      : 'No race in progress'}
                  </div>
                  {currentRaceIndex >= 0 && currentRaceIndex < races.length && (
                    <span
                      className={`rounded-full px-2 py-1 text-xs ${races[currentRaceIndex]?.raceType ? getRaceTypeStyles(races[currentRaceIndex].raceType) : ''}`}
                    >
                      {races[currentRaceIndex]?.raceType}
                    </span>
                  )}
                </div>

                {currentRaceIndex >= 0 && currentRaceIndex < races.length ? (
                  <div className="space-y-4">
                    <div className="text-xs">
                      {races[currentRaceIndex]?.raceDescription}
                    </div>

                    {/* Horse Race Animation */}
                    {showAnimation && (
                      <RaceAnimation
                        horses={horses}
                        raceHorses={races[currentRaceIndex]?.horses || []}
                        onRaceComplete={handleRaceComplete}
                        animationSpeed={animationSpeed}
                        showSpeeds={showHorseSpeeds}
                      />
                    )}

                    <div className="flex items-center gap-2">
                      <div className="text-sm font-medium">Racing Horses:</div>
                      <div className="flex flex-wrap gap-1">
                        {races[currentRaceIndex]?.horses.map((id) => (
                          <div
                            key={id}
                            className="group relative flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white"
                            style={{
                              backgroundColor: horses.find((h) => h.id === id)
                                ?.color,
                            }}
                          >
                            {id}
                            <div className="absolute -top-8 left-1/2 z-20 -translate-x-1/2 rounded border bg-background px-2 py-1 text-xs whitespace-nowrap opacity-0 transition-opacity group-hover:opacity-100">
                              Horse #{id} • Speed:{' '}
                              {horses
                                .find((h) => h.id === id)
                                ?.speed.toFixed(2)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="text-sm font-medium">Race Result:</div>
                      <div className="flex flex-wrap items-center gap-1 rounded-md bg-muted/30 p-2">
                        {races[currentRaceIndex]?.result.map((id, index) => (
                          <div
                            key={id}
                            className="flex items-center duration-300 animate-in fade-in slide-in-from-bottom-2"
                            style={{ animationDelay: `${index * 100}ms` }}
                          >
                            <div
                              className="group relative flex h-10 w-10 items-center justify-center rounded-full text-xs font-bold text-white shadow-sm transition-transform hover:scale-110"
                              style={{
                                backgroundColor: horses.find((h) => h.id === id)
                                  ?.color,
                              }}
                            >
                              {id}
                              <div className="absolute -top-5 left-1/2 flex h-5 w-5 -translate-x-1/2 items-center justify-center rounded-full bg-white/90 text-xs font-semibold shadow-sm dark:bg-slate-800/90">
                                {index + 1}
                              </div>
                              {showHorseSpeeds && (
                                <span className="absolute -bottom-10 left-1/2 z-10 -translate-x-1/2 rounded bg-black/80 px-2 py-1 text-xs whitespace-nowrap text-white opacity-0 transition-opacity group-hover:opacity-100">
                                  Speed:{' '}
                                  {horses
                                    .find((h) => h.id === id)
                                    ?.speed.toFixed(1)}
                                </span>
                              )}
                            </div>
                            {index <
                              (races[currentRaceIndex]?.result.length || 0) -
                                1 && (
                              <ChevronRight
                                size={20}
                                className="mx-1 text-muted-foreground"
                              />
                            )}
                          </div>
                        ))}
                      </div>

                      <div className="mt-3 flex items-center gap-2">
                        <div className="h-2 flex-1 rounded-full bg-gradient-to-r from-green-400 to-red-400 shadow-inner"></div>
                        <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                          <span className="text-green-600 dark:text-green-500">
                            Faster
                          </span>
                          <span>←</span>
                          <span>→</span>
                          <span className="text-red-600 dark:text-red-500">
                            Slower
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    Click Start to begin visualization
                  </div>
                )}
              </Card>
            </div>
          </div>

          {/* Race Insights - add after current race visualization */}
          {currentRaceIndex >= 0 && currentRaceIndex < races.length && (
            <RaceInsights
              horses={horses}
              race={races[currentRaceIndex]!} // Add non-null assertion since we've checked bounds
              allRaces={races}
              currentRaceIndex={currentRaceIndex}
              finalRanking={finalRanking}
            />
          )}

          {/* Secondary Information Tabs for Rankings/Details/Stats/Analytics */}
          <div className="mt-6 space-y-4">
            <div className="flex overflow-x-auto border-b">
              <button
                onClick={() => setActiveInfoTab('rankings')}
                className={`px-4 py-2 text-sm font-medium whitespace-nowrap ${
                  activeInfoTab === 'rankings'
                    ? 'border-b-2 border-primary text-foreground'
                    : 'text-muted-foreground'
                }`}
              >
                Current Rankings
              </button>
              <button
                onClick={() => setActiveInfoTab('horses')}
                className={`px-4 py-2 text-sm font-medium whitespace-nowrap ${
                  activeInfoTab === 'horses'
                    ? 'border-b-2 border-primary text-foreground'
                    : 'text-muted-foreground'
                }`}
              >
                Horse Details
              </button>
              <button
                onClick={() => setActiveInfoTab('diagnostics')}
                className={`px-4 py-2 text-sm font-medium whitespace-nowrap ${
                  activeInfoTab === 'diagnostics'
                    ? 'border-b-2 border-primary text-foreground'
                    : 'text-muted-foreground'
                }`}
              >
                Live Diagnostics
              </button>
              <button
                onClick={() => setActiveInfoTab('stats')}
                className={`px-4 py-2 text-sm font-medium whitespace-nowrap ${
                  activeInfoTab === 'stats'
                    ? 'border-b-2 border-primary text-foreground'
                    : 'text-muted-foreground'
                }`}
              >
                Statistics
              </button>
              <button
                onClick={() => setActiveInfoTab('analytics')}
                className={`px-4 py-2 text-sm font-medium whitespace-nowrap ${
                  activeInfoTab === 'analytics'
                    ? 'border-b-2 border-primary text-foreground'
                    : 'text-muted-foreground'
                }`}
              >
                Advanced Analytics
              </button>
            </div>

            {/* Rankings Tab */}
            {activeInfoTab === 'rankings' && (
              <div className="rounded-md border p-4">
                <h3 className="mb-2 text-lg font-medium">
                  Current Known Rankings
                </h3>
                {finalRanking.length > 0 && currentRaceIndex >= 0 ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold">
                        Ranked{' '}
                        {Math.min(currentRaceIndex + 1, finalRanking.length)} of{' '}
                        {numHorses} horses
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {Math.round(
                          (Math.min(currentRaceIndex + 1, finalRanking.length) /
                            numHorses) *
                            100
                        )}
                        % complete
                      </div>
                    </div>

                    <div className="relative mb-4">
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full bg-primary transition-all duration-500"
                          style={{
                            width: `${Math.min(100, (Math.min(currentRaceIndex + 1, finalRanking.length) / numHorses) * 100)}%`,
                          }}
                        />
                      </div>
                    </div>

                    <div className="relative">
                      <div className="absolute top-4 right-0 left-0 h-1 bg-gradient-to-r from-green-400 to-red-400"></div>
                      <div
                        className={`flex flex-wrap gap-1 pt-1 ${
                          numHorses > 20 ? 'max-h-40 overflow-y-auto pr-2' : ''
                        }`}
                      >
                        {Array.from({
                          length: Math.min(
                            currentRaceIndex + 1,
                            finalRanking.length
                          ),
                        }).map((_, i) => (
                          <div
                            key={i}
                            className="relative flex flex-col items-center"
                          >
                            <div className="mb-1 text-xs font-semibold">
                              #{i + 1}
                            </div>
                            <div
                              className="group relative z-10 flex h-10 w-10 items-center justify-center rounded-full border-2 border-white text-sm font-bold text-white shadow-sm transition-transform hover:scale-110"
                              style={{
                                backgroundColor: horses.find(
                                  (h) => h.id === finalRanking[i]
                                )?.color,
                              }}
                            >
                              {finalRanking[i]}
                              <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 rounded bg-background/90 px-1 py-0.5 text-[10px] text-foreground opacity-0 transition-opacity group-hover:opacity-100">
                                Speed:{' '}
                                {horses
                                  .find((h) => h.id === finalRanking[i])
                                  ?.speed.toFixed(1)}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="mt-4 flex justify-between text-xs text-muted-foreground">
                      <div>Fastest</div>
                      <div>Slowest</div>
                    </div>
                    {numHorses > 20 && (
                      <p className="text-xs text-muted-foreground italic">
                        Scroll to see all ranked horses
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="text-muted-foreground">
                    No ranking determined yet
                  </div>
                )}
              </div>
            )}

            {/* Horse Details Tab */}
            {activeInfoTab === 'horses' && (
              <HorseDetails
                horses={horses}
                finalRanking={finalRanking}
                currentRaceIndex={currentRaceIndex}
                totalRaces={races.length}
              />
            )}

            {/* Statistics Tab */}
            {activeInfoTab === 'stats' && (
              <div className="rounded-md border p-4">
                <h3 className="mb-2 text-lg font-medium">Statistics</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <div>
                      <div className="text-sm font-medium">
                        Total Horses (N):
                      </div>
                      <div className="text-xl font-semibold">{numHorses}</div>
                    </div>
                    <div>
                      <div className="text-sm font-medium">Race Size (M):</div>
                      <div className="text-xl font-semibold">{raceSize}</div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div>
                      <div className="text-sm font-medium">
                        Total Races Required:
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-xl font-semibold">
                          {races.length}
                        </span>
                        {races.length > 0 && (
                          <span className="text-sm text-muted-foreground">
                            ({(races.length / numHorses).toFixed(2)} races per
                            horse)
                          </span>
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm font-medium">
                        Theoretical Minimum:
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-xl font-semibold">
                          ~{theoreticalMinimumRaces}
                        </span>
                        {races.length > 0 && (
                          <span className="text-sm text-muted-foreground">
                            (efficiency:{' '}
                            {(
                              (theoreticalMinimumRaces / races.length) *
                              100
                            ).toFixed(1)}
                            %)
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Race type distribution */}
                  {races.length > 0 && (
                    <div className="mt-4 md:col-span-2">
                      <div className="mb-2 text-sm font-medium">
                        Race Type Distribution:
                      </div>
                      <div className="grid grid-cols-3 gap-4">
                        {(
                          ['preliminary', 'championship', 'candidate'] as const
                        ).map((type) => {
                          const count = races.filter(
                            (race) => race.raceType === type
                          ).length;
                          const percentage = (
                            (count / races.length) *
                            100
                          ).toFixed(1);

                          return (
                            <div key={type} className="space-y-1">
                              <div className="flex items-center justify-between">
                                <span
                                  className={`rounded px-2 py-0.5 text-xs ${getRaceTypeStyles(
                                    type
                                  )}`}
                                >
                                  {type.charAt(0).toUpperCase() + type.slice(1)}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {percentage}%
                                </span>
                              </div>
                              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                                <div
                                  className={`h-full ${
                                    type === 'preliminary'
                                      ? 'bg-blue-500'
                                      : type === 'championship'
                                        ? 'bg-purple-500'
                                        : 'bg-green-500'
                                  }`}
                                  style={{ width: `${percentage}%` }}
                                />
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {count} races
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* New Analytics Tab */}
            {activeInfoTab === 'analytics' && races.length > 0 && (
              <AlgorithmAnalytics
                horses={horses}
                races={races}
                finalRanking={finalRanking}
                raceSize={raceSize}
                numHorses={numHorses}
                currentRaceIndex={currentRaceIndex}
              />
            )}

            {/* New Diagnostics Tab */}
            {activeInfoTab === 'diagnostics' && races.length > 0 && (
              <AlgorithmDiagnostics
                horses={horses}
                races={races}
                finalRanking={finalRanking}
                currentRaceIndex={currentRaceIndex}
                numHorses={numHorses}
                raceSize={raceSize}
              />
            )}
          </div>
        </TabsContent>

        <TabsContent value="explanation" className="mt-4 space-y-6">
          <div className="prose max-w-none dark:prose-invert">
            <h3>The Horse Racing Ranking Problem</h3>
            <p>
              We have N horses and we want to find their ranking from fastest to
              slowest. However, we can only race M horses at a time to determine
              their relative speeds. The goal is to find the complete ranking
              using the minimum number of races.
            </p>

            <h3>Algorithm Approach</h3>
            <p>
              The algorithm uses several key strategies to efficiently determine
              the ranking:
            </p>

            <ol>
              <li>
                <strong>Initial Grouping:</strong> Divide the N horses into
                ceiling(N/M) groups and race each group separately to get
                preliminary rankings.
              </li>
              <li>
                <strong>Tournament of Champions:</strong> Race the winners from
                each group to determine the overall fastest horse.
              </li>
              <li>
                <strong>Candidate Set Maintenance:</strong> For each position,
                we maintain a set of candidates who could possibly be next in
                the ranking.
              </li>
              <li>
                <strong>Progressive Elimination:</strong> Through a series of
                strategic races, we progressively determine the complete ranking
                by eliminating horses that cannot be faster than our current
                candidates.
              </li>
            </ol>

            <h3>Key Insights</h3>
            <p>
              The algorithm leverages the transitive property of race outcomes:
              if horse A is faster than horse B, and horse B is faster than
              horse C, then horse A is faster than horse C without needing to
              race them directly.
            </p>

            <p>
              For any position in the final ranking, we only need to consider a
              small subset of horses as candidates, not the entire remaining
              pool. This significantly reduces the number of races needed.
            </p>

            <h3>Theoretical Analysis</h3>
            <p>
              The algorithm requires approximately O(N log N / log M) races in
              the optimal case, which is close to the theoretical lower bound
              for this problem.
            </p>
            <p>
              For example, with 25 horses and race size 5, the algorithm would
              require around 25 * log(25) / log(5) ≈ 36 races, which is much
              better than the naive approach that would require O(N²)
              comparisons.
            </p>

            <h3>Visualization Guide</h3>
            <p>The visualization shows three types of races:</p>
            <ul>
              <li>
                <strong>Preliminary:</strong> Initial races to determine
                rankings within small groups
              </li>
              <li>
                <strong>Championship:</strong> Races between the winners of
                preliminary groups
              </li>
              <li>
                <strong>Candidate:</strong> Races to determine the next position
                in the final ranking
              </li>
            </ul>
            <p>
              The "Current Known Rankings" section shows the horses that have
              been definitively placed in the final ranking so far.
            </p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
