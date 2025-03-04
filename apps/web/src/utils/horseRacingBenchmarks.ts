/**
 * Pre-calculated benchmarks for the horse racing algorithm
 * These values represent the average performance across multiple runs
 */
import { findHorseRanking } from './horseRacing';

export interface HorseRacingBenchmark {
  horses: number;
  raceSize: number;
  races: number;
  theoreticalMinimum: number;
  theoreticalMaximum: number;
  efficiency: number;
  averageTimeMs?: number;
  isEstimate?: boolean;
}

/**
 * Pre-calculated benchmark data for common scenarios
 * These are placeholder values - will be replaced by real benchmarks
 */
export const benchmarks: HorseRacingBenchmark[] = [];

// We'll populate this with real benchmarks through the UI

/**
 * Find the closest benchmark to a given configuration
 */
export function findClosestBenchmark(
  horses: number,
  raceSize: number,
  customBenchmarks?: HorseRacingBenchmark[]
): HorseRacingBenchmark | undefined {
  const benchmarksToSearch = customBenchmarks || benchmarks;

  // Exact match
  const exactMatch = benchmarksToSearch.find(
    (b) => b.horses === horses && b.raceSize === raceSize
  );

  if (exactMatch) return exactMatch;

  // Find closest match based on a weighted distance metric
  let closestBenchmark: HorseRacingBenchmark | undefined;
  let minDistance = Infinity;

  for (const benchmark of benchmarksToSearch) {
    // Calculate a weighted distance metric
    // We weight horse count differences more heavily than race size differences
    const horseDiff = Math.abs(benchmark.horses - horses);
    const raceSizeDiff = Math.abs(benchmark.raceSize - raceSize);

    const distance = horseDiff * 1.5 + raceSizeDiff * 0.5;

    if (distance < minDistance) {
      minDistance = distance;
      closestBenchmark = benchmark;
    }
  }

  return closestBenchmark;
}

/**
 * Calculate the theoretical minimum number of races for a given configuration
 * This is based on the information theory lower bound
 */
export function calculateTheoreticalMinimum(
  horses: number,
  raceSize: number
): number {
  // In information theory, we need log_raceSize(horses) races to determine the ranking
  const minRaces = Math.ceil(Math.log(horses) / Math.log(raceSize));

  // We also need at least horses/raceSize races to see each horse at least once
  const minGroupRaces = Math.ceil(horses / raceSize);

  return Math.max(minRaces, minGroupRaces);
}

/**
 * Calculate the theoretical maximum (naive approach) number of races
 * This is essentially performing a full comparison of each horse against every other
 */
export function calculateTheoreticalMaximum(horses: number): number {
  // In the worst case, we need n-1 races to determine the full ranking
  return horses - 1;
}

/**
 * Calculate efficiency based on the races required vs theoretical bounds
 */
export function calculateEfficiency(
  races: number,
  theoreticalMinimum: number,
  theoreticalMaximum: number
): number {
  if (theoreticalMaximum === theoreticalMinimum) return 1.0;
  return (
    (theoreticalMaximum - races) / (theoreticalMaximum - theoreticalMinimum)
  );
}

/**
 * Run a benchmark test for a specific configuration
 * @param horses Number of horses
 * @param raceSize Race size
 * @param iterations Number of iterations to run for averaging
 * @returns A benchmark result
 */
export async function runBenchmark(
  horses: number,
  raceSize: number,
  iterations: number = 5
): Promise<HorseRacingBenchmark> {
  let totalRaces = 0;
  let totalTime = 0;

  for (let i = 0; i < iterations; i++) {
    const startTime = performance.now();

    // Create a race function that counts the number of races
    let raceCount = 0;
    const raceFunction = (horseIds: number[]) => {
      raceCount++;
      // Simulate a race by sorting the horses
      return [...horseIds].sort((a, b) => a - b);
    };

    // Run the algorithm
    findHorseRanking(horses, raceSize, raceFunction);

    const endTime = performance.now();

    totalRaces += raceCount;
    totalTime += endTime - startTime;
  }

  const averageRaces = Math.round(totalRaces / iterations);
  const averageTime = Math.round(totalTime / iterations);

  const theoreticalMinimum = calculateTheoreticalMinimum(horses, raceSize);
  const theoreticalMaximum = calculateTheoreticalMaximum(horses);
  const efficiency = calculateEfficiency(
    averageRaces,
    theoreticalMinimum,
    theoreticalMaximum
  );

  return {
    horses,
    raceSize,
    races: averageRaces,
    theoreticalMinimum,
    theoreticalMaximum,
    efficiency,
    averageTimeMs: averageTime,
  };
}

/**
 * Run a series of benchmarks for common configurations
 * @param progressCallback Optional callback to report progress during benchmark
 */
export async function runStandardBenchmarks(
  progressCallback?: (
    completed: number,
    total: number,
    current: HorseRacingBenchmark
  ) => void
): Promise<HorseRacingBenchmark[]> {
  // Define standard configurations to benchmark
  const standardConfigs = [
    { horses: 10, raceSize: 3 },
    { horses: 10, raceSize: 5 },
    { horses: 20, raceSize: 4 },
    { horses: 20, raceSize: 10 },
    { horses: 25, raceSize: 5 },
    { horses: 50, raceSize: 5 },
    { horses: 50, raceSize: 10 },
    { horses: 100, raceSize: 10 },
    { horses: 100, raceSize: 20 },
    { horses: 100, raceSize: 50 },
  ];

  const results: HorseRacingBenchmark[] = [];

  for (let i = 0; i < standardConfigs.length; i++) {
    const config = standardConfigs[i]!;
    const result = await runBenchmark(config.horses, config.raceSize);

    results.push(result);

    if (progressCallback) {
      progressCallback(i + 1, standardConfigs.length, result);
    }

    // Small delay to prevent UI freezing
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  return results;
}

/**
 * Export benchmarks as CSV
 */
export function exportBenchmarksAsCSV(
  benchmarks: HorseRacingBenchmark[]
): string {
  const headers = [
    'Horses',
    'RaceSize',
    'Races',
    'TheoreticalMin',
    'TheoreticalMax',
    'Efficiency',
    'TimeMs',
  ];
  const rows = benchmarks.map((b) => [
    b.horses,
    b.raceSize,
    b.races,
    b.theoreticalMinimum,
    b.theoreticalMaximum,
    b.efficiency.toFixed(3),
    b.averageTimeMs || 'N/A',
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map((row) => row.join(',')),
  ].join('\n');

  return csvContent;
}

/**
 * Export benchmarks as JSON
 */
export function exportBenchmarksAsJSON(
  benchmarks: HorseRacingBenchmark[]
): string {
  return JSON.stringify(benchmarks, null, 2);
}
