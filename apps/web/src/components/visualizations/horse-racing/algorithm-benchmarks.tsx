'use client';

import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { ChevronRight, HelpCircle, Lightbulb } from '@tuturuuu/ui/icons';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tuturuuu/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import { useEffect, useState } from 'react';
import {
  benchmarks as defaultBenchmarks,
  findClosestBenchmark,
  type HorseRacingBenchmark,
} from '@/utils/horseRacingBenchmarks';

interface AlgorithmBenchmarksProps {
  currentHorses: number;
  currentRaceSize: number;
  onSelectBenchmark?: (horses: number, raceSize: number) => void;
  customBenchmarks?: HorseRacingBenchmark[];
}

export function AlgorithmBenchmarks({
  currentHorses,
  currentRaceSize,
  onSelectBenchmark,
  customBenchmarks = [],
}: AlgorithmBenchmarksProps) {
  const [showAllBenchmarks, setShowAllBenchmarks] = useState(false);
  const [storedBenchmarks, setStoredBenchmarks] = useState<
    HorseRacingBenchmark[]
  >([...defaultBenchmarks, ...customBenchmarks]);

  // Update stored benchmarks when customBenchmarks changes
  useEffect(() => {
    // Merge default benchmarks with custom benchmarks
    // If there are duplicates (same horse count and race size), prefer the custom benchmark
    const combinedBenchmarks = [...defaultBenchmarks];

    customBenchmarks.forEach((customBenchmark) => {
      const existingIndex = combinedBenchmarks.findIndex(
        (b) =>
          b.horses === customBenchmark.horses &&
          b.raceSize === customBenchmark.raceSize
      );

      if (existingIndex >= 0) {
        combinedBenchmarks[existingIndex] = customBenchmark;
      } else {
        combinedBenchmarks.push(customBenchmark);
      }
    });

    setStoredBenchmarks(combinedBenchmarks);
  }, [customBenchmarks]);

  // Find the closest benchmark to the current configuration
  const closestBenchmark = findClosestBenchmark(
    currentHorses,
    currentRaceSize,
    storedBenchmarks
  );

  // Calculate if the current config is an exact match
  const isExactMatch =
    closestBenchmark?.horses === currentHorses &&
    closestBenchmark?.raceSize === currentRaceSize;

  // Show either all benchmarks or just a few, depending on the state
  const displayedBenchmarks = showAllBenchmarks
    ? storedBenchmarks
    : storedBenchmarks.slice(0, 5);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-amber-500" />
          <h3 className="font-medium text-base">Algorithm Benchmarks</h3>
        </div>
      </div>

      {/* For the current configuration */}
      {closestBenchmark && (
        <div className="rounded-md border p-4">
          <h4 className="mb-2 font-medium">
            {isExactMatch ? 'Expected Performance' : 'Closest Benchmark'}
          </h4>

          <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-3">
            <div>
              <div className="text-muted-foreground text-xs">Configuration</div>
              <div className="font-medium">
                {closestBenchmark.horses} horses / {closestBenchmark.raceSize}{' '}
                race size
              </div>
            </div>

            <div>
              <div className="text-muted-foreground text-xs">
                Expected Races
              </div>
              <div className="font-medium">{closestBenchmark.races}</div>
            </div>

            <div>
              <div className="text-muted-foreground text-xs">Efficiency</div>
              <div className="font-medium">
                {(closestBenchmark.efficiency * 100).toFixed(1)}%
              </div>
            </div>
          </div>

          <div className="text-muted-foreground text-sm">
            {isExactMatch ? (
              <>
                Expected to complete in {closestBenchmark.races} races, which is{' '}
                {closestBenchmark.theoreticalMinimum === closestBenchmark.races
                  ? 'optimal'
                  : `${closestBenchmark.races - closestBenchmark.theoreticalMinimum} more than the theoretical minimum`}
                .
              </>
            ) : (
              <>
                This is the closest benchmark to your current configuration (
                {currentHorses} horses / {currentRaceSize} race size).
              </>
            )}
          </div>

          {!isExactMatch && onSelectBenchmark && (
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() =>
                onSelectBenchmark(
                  closestBenchmark.horses,
                  closestBenchmark.raceSize
                )
              }
            >
              Switch to this configuration
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          )}
        </div>
      )}

      {storedBenchmarks.length > 0 ? (
        <>
          {/* Benchmark table */}
          <Table>
            <TableCaption>
              {storedBenchmarks.length > 5
                ? showAllBenchmarks
                  ? 'Showing all benchmarks'
                  : `Showing 5 of ${storedBenchmarks.length} benchmarks`
                : 'Performance benchmarks for common scenarios'}
            </TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Horses</TableHead>
                <TableHead>Race Size</TableHead>
                <TableHead className="text-center">Races</TableHead>
                <TableHead className="hidden md:table-cell">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center justify-center">
                          Min
                          <HelpCircle className="ml-1 h-3 w-3" />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-60">
                          Theoretical minimum races required based on
                          information theory
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </TableHead>
                <TableHead className="hidden md:table-cell">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center justify-center">
                          Max
                          <HelpCircle className="ml-1 h-3 w-3" />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-60">
                          Theoretical maximum races with naive approach (n-1)
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </TableHead>
                <TableHead className="text-center">Efficiency</TableHead>
                <TableHead className="hidden lg:table-cell">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayedBenchmarks.map((benchmark) => {
                const isCustomBenchmark = customBenchmarks.some(
                  (b) =>
                    b.horses === benchmark.horses &&
                    b.raceSize === benchmark.raceSize
                );

                return (
                  <TableRow
                    key={`${benchmark.horses}-${benchmark.raceSize}`}
                    className={
                      benchmark.horses === currentHorses &&
                      benchmark.raceSize === currentRaceSize
                        ? 'bg-muted/50'
                        : ''
                    }
                  >
                    <TableCell>{benchmark.horses}</TableCell>
                    <TableCell>{benchmark.raceSize}</TableCell>
                    <TableCell className="text-center font-medium">
                      {benchmark.races}
                    </TableCell>
                    <TableCell className="hidden text-center text-muted-foreground md:table-cell">
                      {benchmark.theoreticalMinimum}
                    </TableCell>
                    <TableCell className="hidden text-center text-muted-foreground md:table-cell">
                      {benchmark.theoreticalMaximum}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant={isCustomBenchmark ? 'secondary' : 'outline'}
                      >
                        {(benchmark.efficiency * 100).toFixed(1)}%
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {onSelectBenchmark && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            onSelectBenchmark(
                              benchmark.horses,
                              benchmark.raceSize
                            )
                          }
                          disabled={
                            benchmark.horses === currentHorses &&
                            benchmark.raceSize === currentRaceSize
                          }
                        >
                          {benchmark.horses === currentHorses &&
                          benchmark.raceSize === currentRaceSize
                            ? 'Current'
                            : 'Select'}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          {storedBenchmarks.length > 5 && (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setShowAllBenchmarks(!showAllBenchmarks)}
            >
              {showAllBenchmarks
                ? 'Show fewer benchmarks'
                : `Show all ${storedBenchmarks.length} benchmarks`}
            </Button>
          )}
        </>
      ) : (
        <div className="rounded-md border py-6 text-center text-muted-foreground">
          <p className="mb-2">No benchmark data available yet</p>
          <p className="text-sm">
            Run benchmarks from the main Benchmarks tab to generate data
          </p>
        </div>
      )}
    </div>
  );
}
