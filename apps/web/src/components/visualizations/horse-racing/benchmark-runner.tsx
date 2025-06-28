'use client';

import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  BarChart4,
  Download,
  HelpCircle,
  Play,
  Plus,
  Save,
  Trash,
} from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Progress } from '@tuturuuu/ui/progress';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Skeleton } from '@tuturuuu/ui/skeleton';
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
  benchmarks,
  exportBenchmarksAsCSV,
  exportBenchmarksAsJSON,
  type HorseRacingBenchmark,
  runBenchmark,
  runStandardBenchmarks,
} from '@/utils/horseRacingBenchmarks';

interface BenchmarkRunnerProps {
  onBenchmarksUpdated?: (benchmarks: HorseRacingBenchmark[]) => void;
}

export function BenchmarkRunner({ onBenchmarksUpdated }: BenchmarkRunnerProps) {
  // Benchmark state
  const [userBenchmarks, setUserBenchmarks] = useState<HorseRacingBenchmark[]>(
    []
  );
  const [allBenchmarks, setAllBenchmarks] =
    useState<HorseRacingBenchmark[]>(benchmarks);
  const [isRunningBenchmark, setIsRunningBenchmark] = useState(false);
  const [benchmarkProgress, setBenchmarkProgress] = useState(0);
  const [currentBenchmark, setCurrentBenchmark] =
    useState<HorseRacingBenchmark | null>(null);
  const [customBenchmarkDialogOpen, setCustomBenchmarkDialogOpen] =
    useState(false);
  const [sortField, setSortField] =
    useState<keyof HorseRacingBenchmark>('horses');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Custom benchmark inputs
  const [customHorses, setCustomHorses] = useState(25);
  const [customRaceSize, setCustomRaceSize] = useState(5);
  const [customIterations, setCustomIterations] = useState(5);
  const [customBenchmarkRunning, setCustomBenchmarkRunning] = useState(false);
  const [customBenchmarkResult, setCustomBenchmarkResult] =
    useState<HorseRacingBenchmark | null>(null);

  // Update combined benchmarks whenever user benchmarks change
  useEffect(() => {
    // Combine system benchmarks (if any) with user benchmarks
    const combined = [...benchmarks, ...userBenchmarks];

    // Only update state if the benchmarks actually changed
    if (JSON.stringify(combined) !== JSON.stringify(allBenchmarks)) {
      setAllBenchmarks(combined);

      // Notify parent component if callback provided
      if (onBenchmarksUpdated) {
        onBenchmarksUpdated(combined);
      }
    }
  }, [userBenchmarks, onBenchmarksUpdated]);

  // Run the standard benchmark suite
  const handleRunStandardBenchmarks = async () => {
    setIsRunningBenchmark(true);
    setBenchmarkProgress(0);

    try {
      const results = await runStandardBenchmarks(
        (completed, total, current) => {
          setBenchmarkProgress((completed / total) * 100);
          setCurrentBenchmark(current);
        }
      );

      setUserBenchmarks((prev) => {
        // Remove any duplicates from previous runs
        const filteredPrev = prev.filter(
          (b) =>
            !results.some(
              (r) => r.horses === b.horses && r.raceSize === b.raceSize
            )
        );
        return [...filteredPrev, ...results];
      });
    } catch (error) {
      console.error('Error running benchmarks:', error);
    } finally {
      setIsRunningBenchmark(false);
    }
  };

  // Run a custom benchmark
  const handleRunCustomBenchmark = async () => {
    setCustomBenchmarkRunning(true);
    setCustomBenchmarkResult(null);

    try {
      const result = await runBenchmark(
        customHorses,
        customRaceSize,
        customIterations
      );
      setCustomBenchmarkResult(result);

      // Add to user benchmarks if it doesn't already exist
      setUserBenchmarks((prev) => {
        const existingIndex = prev.findIndex(
          (b) => b.horses === result.horses && b.raceSize === result.raceSize
        );

        if (existingIndex >= 0) {
          const updated = [...prev];
          updated[existingIndex] = result;
          return updated;
        } else {
          return [...prev, result];
        }
      });
    } catch (error) {
      console.error('Error running custom benchmark:', error);
    } finally {
      setCustomBenchmarkRunning(false);
    }
  };

  // Add custom benchmark config to run later
  const handleAddCustomConfig = () => {
    setCustomBenchmarkDialogOpen(false);

    if (customBenchmarkResult) {
      // The benchmark has already been added via handleRunCustomBenchmark
      setCustomBenchmarkResult(null);
      return;
    }
  };

  // Export benchmarks
  const handleExport = (format: 'csv' | 'json') => {
    if (allBenchmarks.length === 0) return;

    let content: string;
    let filename: string;
    let type: string;

    if (format === 'csv') {
      content = exportBenchmarksAsCSV(allBenchmarks);
      filename = 'horse-racing-benchmarks.csv';
      type = 'text/csv';
    } else {
      content = exportBenchmarksAsJSON(allBenchmarks);
      filename = 'horse-racing-benchmarks.json';
      type = 'application/json';
    }

    // Create a download link
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Clear user benchmarks
  const handleClearBenchmarks = () => {
    setUserBenchmarks([]);
  };

  // Handle sorting
  const handleSort = (field: keyof HorseRacingBenchmark) => {
    if (sortField === field) {
      // Toggle direction
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // New field, default to ascending
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Sort benchmarks based on current sort settings
  const sortedBenchmarks = [...allBenchmarks].sort((a, b) => {
    const valueA = a[sortField];
    const valueB = b[sortField];

    if (typeof valueA === 'number' && typeof valueB === 'number') {
      return sortDirection === 'asc' ? valueA - valueB : valueB - valueA;
    }

    return 0;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h3 className="text-lg font-medium">Algorithm Benchmarks</h3>
          <p className="text-sm text-muted-foreground">
            Run performance tests across different configurations
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={isRunningBenchmark}
            onClick={handleRunStandardBenchmarks}
            className="gap-1"
          >
            <Play className="h-4 w-4" />
            Run Standard Benchmarks
          </Button>
          <Button
            variant="outline"
            onClick={() => setCustomBenchmarkDialogOpen(true)}
            className="gap-1"
          >
            <Plus className="h-4 w-4" />
            Custom Benchmark
          </Button>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  onClick={() => handleExport('csv')}
                  disabled={allBenchmarks.length === 0}
                  size="icon"
                >
                  <Download className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Export as CSV</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  onClick={() => handleExport('json')}
                  disabled={allBenchmarks.length === 0}
                  size="icon"
                >
                  <Save className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Export as JSON</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {userBenchmarks.length > 0 && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    onClick={handleClearBenchmarks}
                    size="icon"
                  >
                    <Trash className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  Clear User Benchmarks
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>

      {/* Benchmark Progress */}
      {isRunningBenchmark && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Running Benchmarks</CardTitle>
            <CardDescription>
              Testing algorithm performance on standard configurations
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <Progress value={benchmarkProgress} className="h-2" />
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <div className="text-xs text-muted-foreground">
                    Current Test
                  </div>
                  <div className="font-medium">
                    {currentBenchmark ? (
                      `${currentBenchmark.horses} horses / ${currentBenchmark.raceSize} race size`
                    ) : (
                      <Skeleton className="h-4 w-20" />
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Progress</div>
                  <div className="font-medium">
                    {Math.round(benchmarkProgress)}%
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Races</div>
                  <div className="font-medium">
                    {currentBenchmark ? (
                      `${currentBenchmark.races} races`
                    ) : (
                      <Skeleton className="h-4 w-16" />
                    )}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Benchmarks Table */}
      {allBenchmarks.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableCaption>
                {userBenchmarks.length > 0
                  ? `Showing ${allBenchmarks.length} benchmarks (${userBenchmarks.length} user-generated)`
                  : 'Pre-calculated benchmarks for common scenarios'}
              </TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead
                    className="cursor-pointer"
                    onClick={() => handleSort('horses')}
                  >
                    <div className="flex items-center">
                      Horses
                      {sortField === 'horses' &&
                        (sortDirection === 'asc' ? (
                          <ArrowUp className="ml-1 h-3 w-3" />
                        ) : (
                          <ArrowDown className="ml-1 h-3 w-3" />
                        ))}
                    </div>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer"
                    onClick={() => handleSort('raceSize')}
                  >
                    <div className="flex items-center">
                      Race Size
                      {sortField === 'raceSize' &&
                        (sortDirection === 'asc' ? (
                          <ArrowUp className="ml-1 h-3 w-3" />
                        ) : (
                          <ArrowDown className="ml-1 h-3 w-3" />
                        ))}
                    </div>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer text-center"
                    onClick={() => handleSort('races')}
                  >
                    <div className="flex items-center justify-center">
                      Races
                      {sortField === 'races' &&
                        (sortDirection === 'asc' ? (
                          <ArrowUp className="ml-1 h-3 w-3" />
                        ) : (
                          <ArrowDown className="ml-1 h-3 w-3" />
                        ))}
                    </div>
                  </TableHead>
                  <TableHead className="hidden text-center md:table-cell">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div
                            className="flex cursor-pointer items-center justify-center"
                            onClick={() => handleSort('theoreticalMinimum')}
                          >
                            Min
                            <HelpCircle className="ml-1 h-3 w-3" />
                            {sortField === 'theoreticalMinimum' &&
                              (sortDirection === 'asc' ? (
                                <ArrowUp className="ml-1 h-3 w-3" />
                              ) : (
                                <ArrowDown className="ml-1 h-3 w-3" />
                              ))}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="max-w-60">
                            Theoretical minimum races required
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </TableHead>
                  <TableHead className="hidden text-center md:table-cell">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div
                            className="flex cursor-pointer items-center justify-center"
                            onClick={() => handleSort('theoreticalMaximum')}
                          >
                            Max
                            <HelpCircle className="ml-1 h-3 w-3" />
                            {sortField === 'theoreticalMaximum' &&
                              (sortDirection === 'asc' ? (
                                <ArrowUp className="ml-1 h-3 w-3" />
                              ) : (
                                <ArrowDown className="ml-1 h-3 w-3" />
                              ))}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="max-w-60">Theoretical maximum races</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer text-center"
                    onClick={() => handleSort('efficiency')}
                  >
                    <div className="flex items-center justify-center">
                      Efficiency
                      {sortField === 'efficiency' &&
                        (sortDirection === 'asc' ? (
                          <ArrowUp className="ml-1 h-3 w-3" />
                        ) : (
                          <ArrowDown className="ml-1 h-3 w-3" />
                        ))}
                    </div>
                  </TableHead>
                  <TableHead
                    className="hidden cursor-pointer text-center lg:table-cell"
                    onClick={() => handleSort('averageTimeMs')}
                  >
                    <div className="flex items-center justify-center">
                      Time (ms)
                      {sortField === 'averageTimeMs' &&
                        (sortDirection === 'asc' ? (
                          <ArrowUp className="ml-1 h-3 w-3" />
                        ) : (
                          <ArrowDown className="ml-1 h-3 w-3" />
                        ))}
                    </div>
                  </TableHead>
                  <TableHead className="hidden text-center lg:table-cell">
                    Source
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedBenchmarks.map((benchmark) => {
                  const isUserBenchmark = userBenchmarks.some(
                    (b) =>
                      b.horses === benchmark.horses &&
                      b.raceSize === benchmark.raceSize
                  );

                  return (
                    <TableRow key={`${benchmark.horses}-${benchmark.raceSize}`}>
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
                          variant={
                            benchmark.efficiency > 0.85 ? 'success' : 'outline'
                          }
                        >
                          {(benchmark.efficiency * 100).toFixed(1)}%
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden text-center text-muted-foreground lg:table-cell">
                        {benchmark.averageTimeMs !== undefined
                          ? benchmark.averageTimeMs
                          : 'N/A'}
                      </TableCell>
                      <TableCell className="hidden text-center lg:table-cell">
                        {isUserBenchmark ? (
                          <Badge variant="secondary">User</Badge>
                        ) : (
                          <Badge variant="outline">System</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center p-6 text-center">
            <BarChart4 className="mb-2 h-10 w-10 text-muted-foreground" />
            <h3 className="mb-1 font-medium">No benchmark data</h3>
            <p className="mb-4 text-sm text-muted-foreground">
              Run benchmarks to see how the algorithm performs
            </p>
            <Button
              onClick={handleRunStandardBenchmarks}
              disabled={isRunningBenchmark}
            >
              <Play className="mr-2 h-4 w-4" />
              Run Standard Benchmarks
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Custom Benchmark Dialog */}
      <Dialog
        open={customBenchmarkDialogOpen}
        onOpenChange={setCustomBenchmarkDialogOpen}
      >
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Run Custom Benchmark</DialogTitle>
            <DialogDescription>
              Test algorithm performance with your own configuration
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="horses">Number of Horses</Label>
                <Input
                  id="horses"
                  type="number"
                  value={customHorses}
                  onChange={(e) =>
                    setCustomHorses(parseInt(e.target.value) || 10)
                  }
                  min={2}
                  max={1000}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="race-size">Race Size</Label>
                <Input
                  id="race-size"
                  type="number"
                  value={customRaceSize}
                  onChange={(e) =>
                    setCustomRaceSize(parseInt(e.target.value) || 2)
                  }
                  min={2}
                  max={Math.min(100, customHorses)}
                />
                {customRaceSize > customHorses && (
                  <p className="flex items-center text-xs text-destructive">
                    <AlertCircle className="mr-1 h-3 w-3" />
                    Race size cannot exceed horse count
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="iterations">Iterations (for averaging)</Label>
              <Select
                value={customIterations.toString()}
                onValueChange={(value) => setCustomIterations(parseInt(value))}
              >
                <SelectTrigger id="iterations">
                  <SelectValue placeholder="Select iterations" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Iterations</SelectLabel>
                    <SelectItem value="1">1 (Fastest)</SelectItem>
                    <SelectItem value="3">3</SelectItem>
                    <SelectItem value="5">5 (Recommended)</SelectItem>
                    <SelectItem value="10">10 (More accurate)</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            {customBenchmarkResult && (
              <div className="rounded-md bg-muted p-3">
                <h4 className="mb-2 text-sm font-medium">Result</h4>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Races:</span>{' '}
                    <span className="font-medium">
                      {customBenchmarkResult.races}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Efficiency:</span>{' '}
                    <span className="font-medium">
                      {(customBenchmarkResult.efficiency * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Time:</span>{' '}
                    <span className="font-medium">
                      {customBenchmarkResult.averageTimeMs}ms
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCustomBenchmarkDialogOpen(false)}
              disabled={customBenchmarkRunning}
            >
              Cancel
            </Button>
            <Button
              onClick={
                customBenchmarkResult
                  ? handleAddCustomConfig
                  : handleRunCustomBenchmark
              }
              disabled={customBenchmarkRunning || customRaceSize > customHorses}
            >
              {customBenchmarkRunning ? (
                <>Running...</>
              ) : customBenchmarkResult ? (
                <>Add to Benchmarks</>
              ) : (
                <>Run Benchmark</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
