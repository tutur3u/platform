import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Crown,
  Medal,
  Pause,
  Play,
  RefreshCw,
} from '@tuturuuu/ui/icons';
import { Progress } from '@tuturuuu/ui/progress';
import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

interface Race {
  horses: number[];
  result: number[];
  raceType: 'preliminary' | 'championship' | 'candidate';
  raceDescription: string;
}

interface RaceControlsProps {
  races: Race[];
  currentRaceIndex: number;
  isRunning: boolean;
  isAnimating: boolean;
  startVisualization: () => void;
  togglePlayPause: () => void;
  resetVisualization: () => void;
  navigateToRace: (index: number) => void;
  animationSpeed: number;
  setAnimationSpeed: (value: number) => void;
}

export function RaceControls({
  races,
  currentRaceIndex,
  isRunning,
  isAnimating,
  startVisualization,
  togglePlayPause,
  resetVisualization,
  navigateToRace,
  animationSpeed,
  setAnimationSpeed,
}: RaceControlsProps) {
  const [showSpeedControl, setShowSpeedControl] = useState(false);
  const [hoverPosition, setHoverPosition] = useState<number | null>(null);

  // Button configurations for speed control
  const speedOptions = [
    { value: 500, label: '2x' },
    { value: 1000, label: '1x' },
    { value: 1500, label: '0.75x' },
    { value: 2000, label: '0.5x' },
  ];

  // Helper function to determine race type styling
  const getRaceTypeStyles = (
    type: 'preliminary' | 'championship' | 'candidate'
  ) => {
    switch (type) {
      case 'preliminary':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300';
      case 'championship':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300';
      case 'candidate':
        return 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300';
    }
  };

  // Helper functions for navigation
  const goToFirstRace = () => navigateToRace(0);
  const goToPreviousRace = () => navigateToRace(currentRaceIndex - 1);
  const goToNextRace = () => navigateToRace(currentRaceIndex + 1);
  const goToLastRace = () => navigateToRace(races.length - 1);

  // Auto-hide speed control after a delay
  useEffect(() => {
    let timeout: NodeJS.Timeout;
    if (showSpeedControl) {
      timeout = setTimeout(() => {
        setShowSpeedControl(false);
      }, 5000);
    }
    return () => {
      if (timeout) clearTimeout(timeout);
    };
  }, [showSpeedControl]);

  return (
    <div className="space-y-4">
      {/* Primary controls */}
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <Button
          variant={isRunning && isAnimating ? 'outline' : undefined}
          onClick={isRunning ? togglePlayPause : startVisualization}
        >
          {isRunning && isAnimating ? (
            <Pause size={16} className="mr-2" />
          ) : (
            <Play size={16} className="mr-2" />
          )}
          {isRunning && isAnimating ? 'Pause' : 'Play'}
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

      {/* Speed control (conditionally shown) */}
      {showSpeedControl && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="bg-background rounded-md border p-3"
        >
          <div className="mb-2 text-xs font-medium">Animation Speed</div>
          <div className="flex flex-wrap gap-2">
            {speedOptions.map((option) => (
              <Button
                key={option.value}
                variant={
                  animationSpeed === option.value ? 'default' : 'outline'
                }
                size="sm"
                onClick={() => setAnimationSpeed(option.value)}
                className="flex-1"
              >
                {option.label}
              </Button>
            ))}
          </div>
        </motion.div>
      )}

      {/* Race progress information */}
      {races.length > 0 && (
        <>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">Race Progress</span>
              <div className="flex items-center gap-1.5">
                <span>
                  {currentRaceIndex + 1} of {races.length}
                </span>
                {currentRaceIndex >= 0 && currentRaceIndex < races.length && (
                  <Badge
                    variant="outline"
                    className={
                      races[currentRaceIndex]?.raceType
                        ? getRaceTypeStyles(races[currentRaceIndex]?.raceType)
                        : ''
                    }
                  >
                    {races[currentRaceIndex]?.raceType}
                  </Badge>
                )}
              </div>
            </div>

            <Progress
              value={((currentRaceIndex + 1) / races.length) * 100}
              className="h-2"
            />
          </div>

          {/* Navigation controls */}
          <div className="mt-3 flex items-center gap-1">
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

            {/* Race timeline scrubber */}
            <div
              className="bg-muted group relative h-8 flex-1 cursor-pointer overflow-hidden rounded-md"
              onMouseMove={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const offsetX = e.clientX - rect.left;
                const percentage = offsetX / rect.width;
                const position = Math.max(
                  0,
                  Math.min(
                    Math.floor(percentage * races.length),
                    races.length - 1
                  )
                );
                setHoverPosition(position);
              }}
              onMouseLeave={() => setHoverPosition(null)}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const offsetX = e.clientX - rect.left;
                const percentage = offsetX / rect.width;
                const position = Math.max(
                  0,
                  Math.min(
                    Math.floor(percentage * races.length),
                    races.length - 1
                  )
                );
                navigateToRace(position);
              }}
            >
              {/* Hover preview */}
              {hoverPosition !== null && (
                <div
                  className="border-primary absolute top-0 z-10 h-full border-r-2 transition-all duration-75"
                  style={{ left: `${(hoverPosition / races.length) * 100}%` }}
                >
                  <div className="bg-background absolute top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-xs shadow-sm">
                    Race {hoverPosition + 1}
                  </div>
                </div>
              )}

              {/* Race markers */}
              <div className="absolute left-0 top-0 h-full w-full">
                {races.map((race, idx) => {
                  // Create visual markers for different race types
                  const markerColor =
                    race.raceType === 'preliminary'
                      ? 'bg-blue-500/30'
                      : race.raceType === 'championship'
                        ? 'bg-purple-500/50'
                        : 'bg-green-500/50';

                  const isCurrentRace = idx === currentRaceIndex;

                  return (
                    <div
                      key={idx}
                      className={`absolute top-0 h-full w-[3px] transform ${markerColor} ${
                        isCurrentRace ? 'opacity-100' : 'opacity-50'
                      }`}
                      style={{ left: `${(idx / races.length) * 100}%` }}
                    />
                  );
                })}
              </div>

              {/* Current position indicator */}
              <div
                className="absolute top-0 z-20 h-full transition-all duration-300"
                style={{
                  width: `${((currentRaceIndex + 1) / races.length) * 100}%`,
                }}
              >
                <div className="bg-primary/30 h-full w-full" />
                <div className="bg-primary absolute right-0 top-0 h-full w-1" />
                <div className="bg-primary absolute -right-2 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center rounded-full shadow-sm">
                  {races[currentRaceIndex]?.raceType === 'preliminary' ? (
                    <span className="text-[10px] font-bold text-white">
                      {currentRaceIndex + 1}
                    </span>
                  ) : races[currentRaceIndex]?.raceType === 'championship' ? (
                    <Crown size={10} className="text-white" />
                  ) : (
                    <Medal size={10} className="text-white" />
                  )}
                </div>
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

          {/* Race description */}
          {currentRaceIndex >= 0 && currentRaceIndex < races.length && (
            <div className="mt-2 text-center text-sm">
              {races[currentRaceIndex]?.raceDescription}
            </div>
          )}
        </>
      )}
    </div>
  );
}
