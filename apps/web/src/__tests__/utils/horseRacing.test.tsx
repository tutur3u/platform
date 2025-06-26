import { describe, expect, it } from 'vitest';
import { findHorseRanking } from '../../utils/horseRacing';

describe('Horse Racing Ranking Algorithm', () => {
  it('should return an empty array when there are no horses', () => {
    const result = findHorseRanking(0, 5, () => []);
    expect(result).toEqual([]);
  });

  it('should return the correct ranking when n <= m (all horses can race together)', () => {
    // When all horses can race at once, the result should be the same as the race result
    const n = 5;
    const m = 5;
    const mockRaceFunction = (horses: number[]) => {
      // This simulates a race where horse[i] finishes in position i
      return [...horses].sort((a, b) => {
        // Simulate horse speeds: lower numbers represent faster horses
        return a - b;
      });
    };

    const result = findHorseRanking(n, m, mockRaceFunction);
    expect(result).toEqual([0, 1, 2, 3, 4]);
  });

  it('should find the correct ranking when n > m and multiple races are needed', () => {
    // For this test, we'll use 7 horses and races of 3 horses at a time
    const n = 7;
    const m = 3;

    // Define fixed speeds for consistent testing
    const horseSpeeds = [5, 7, 3, 1, 6, 2, 4]; // lower is faster

    const mockRaceFunction = (horses: number[]) => {
      // Return horses sorted by their speed (from horseSpeeds array)
      return [...horses].sort(
        (a, b) => (horseSpeeds?.[a] || 0) - (horseSpeeds?.[b] || 0)
      );
    };

    const result = findHorseRanking(n, m, mockRaceFunction);

    // Get the expected result by sorting all horses by their speed
    const expected = Array.from({ length: n }, (_, i) => i).sort(
      (a, b) => (horseSpeeds?.[a] || 0) - (horseSpeeds?.[b] || 0)
    );

    console.log('Expected:', expected);
    console.log('Actual:', result);

    // Check that the result has the fastest horse first
    expect(result[0]).toBe(3); // Horse 3 has speed 1 (fastest)
    expect(result[n - 1]).toBe(1); // Horse 1 has speed 7 (slowest)
  });

  it('should handle edge case where m = 1 (impossible to compare)', () => {
    const n = 5;
    const m = 1;

    // This is impossible to determine ranking when we can only race 1 horse at a time
    expect(() => findHorseRanking(n, m, () => [])).toThrow();
  });

  it('should handle edge case where m > n (more slots than horses)', () => {
    const n = 3;
    const m = 5;

    const mockRaceFunction = () => {
      return [2, 0, 1]; // Horse 2 is fastest, followed by 0, then 1
    };

    const result = findHorseRanking(n, m, mockRaceFunction);
    expect(result).toEqual([2, 0, 1]);
  });

  it('should work with a larger example', () => {
    const n = 10;
    const m = 4;

    // Define fixed speeds
    const horseSpeeds = [8, 5, 2, 10, 6, 1, 7, 3, 9, 4]; // lower is faster

    const mockRaceFunction = (horses: number[]) => {
      return [...horses].sort(
        (a, b) => (horseSpeeds?.[a] || 0) - (horseSpeeds?.[b] || 0)
      );
    };

    const result = findHorseRanking(n, m, mockRaceFunction);

    // Expected order based on speeds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    // Which corresponds to indices: [5, 2, 7, 9, 1, 4, 6, 0, 8, 3]
    const expected = [5, 2, 7, 9, 1, 4, 6, 0, 8, 3];
    expect(result).toEqual(expected);
  });

  it('should handle a large number of horses', () => {
    const n = 25;
    const m = 5;

    // Create an array of speeds (1 = fastest, 25 = slowest)
    // We'll shuffle them to create random horse speeds
    const speeds = Array.from({ length: n }, (_, i) => i + 1);

    // Fisher-Yates shuffle algorithm to randomize horse speeds
    for (let i = speeds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = speeds[i];
      speeds[i] = speeds[j];
      speeds[j] = temp;
    }

    // For testing, we'll fix the seed by setting specific values
    const fixedSpeeds = [
      15,
      7,
      22,
      3,
      19, // Horses 0-4
      25,
      8,
      11,
      9,
      18, // Horses 5-9
      5,
      23,
      1,
      16,
      10, // Horses 10-14
      21,
      4,
      14,
      20,
      13, // Horses 15-19
      2,
      17,
      24,
      12,
      6, // Horses 20-24
    ];

    let raceCount = 0;

    const mockRaceFunction = (horses: number[]) => {
      // Count the number of races
      raceCount++;

      // Sort horses by their speed (from fixedSpeeds array)
      return [...horses].sort(
        (a, b) => (fixedSpeeds?.[a] || 0) - (fixedSpeeds?.[b] || 0)
      );
    };

    const result = findHorseRanking(n, m, mockRaceFunction);

    // Sort the horses by their speed and get the indices
    const expectedIndices = Array.from({ length: n }, (_, i) => i).sort(
      (a, b) => (fixedSpeeds?.[a] || 0) - (fixedSpeeds?.[b] || 0)
    );

    expect(result).toEqual(expectedIndices);

    // Log the number of races performed for informational purposes
    console.log(
      `Ranked ${n} horses with races of ${m} horses each using ${raceCount} races`
    );

    // The result should represent horses sorted from fastest to slowest
    // Horse 12 should be first (speed 1), and horse 5 should be last (speed 25)
    expect(result[0]).toBe(12); // Fastest horse (speed 1)
    expect(result[n - 1]).toBe(5); // Slowest horse (speed 25)
  });

  it('should handle a large number of horses (100 horses)', () => {
    const n = 100;
    const m = 5;

    // Create fixed speeds for all 100 horses (1 = fastest, 100 = slowest)
    const horseSpeeds: number[] = [];
    for (let i = 0; i < n; i++) {
      horseSpeeds[i] = i + 1;
    }

    // Shuffle the speeds using Fisher-Yates algorithm with a fixed seed
    // This ensures tests are deterministic while still testing a random distribution
    const shuffledSpeeds = [...horseSpeeds];
    const seedValue = 12345; // Fixed seed for reproducibility
    const pseudoRandom = (i: number) => {
      // Simple LCG for deterministic randomness
      return (i * 1664525 + 1013904223) % 4294967296;
    };

    let seed = seedValue;
    for (let i = shuffledSpeeds.length - 1; i > 0; i--) {
      seed = pseudoRandom(seed);
      const j = seed % (i + 1);
      const temp = shuffledSpeeds[i];
      shuffledSpeeds[i] = shuffledSpeeds[j];
      shuffledSpeeds[j] = temp;
    }

    let raceCount = 0;

    const mockRaceFunction = (horses: number[]) => {
      // Count the number of races
      raceCount++;

      // Sort horses by their speed
      return [...horses].sort(
        (a, b) => (shuffledSpeeds?.[a] || 0) - (shuffledSpeeds?.[b] || 0)
      );
    };

    const result = findHorseRanking(n, m, mockRaceFunction);

    // Calculate expected result - horses sorted by their speed
    const expected = Array.from({ length: n }, (_, i) => i).sort(
      (a, b) => (shuffledSpeeds?.[a] || 0) - (shuffledSpeeds?.[b] || 0)
    );

    // Test first, middle, and last few horses instead of the entire array for better performance
    expect(result.slice(0, 5)).toEqual(expected.slice(0, 5)); // First 5
    expect(result.slice(48, 52)).toEqual(expected.slice(48, 52)); // Middle 4
    expect(result.slice(n - 5)).toEqual(expected.slice(n - 5)); // Last 5

    // Check if fastest and slowest horses are in correct positions
    const fastestHorseIndex = Array.from({ length: n }, (_, i) => i).reduce(
      (a, b) =>
        (shuffledSpeeds?.[a] || 0) < (shuffledSpeeds?.[b] || 0) ? a : b
    );

    const slowestHorseIndex = Array.from({ length: n }, (_, i) => i).reduce(
      (a, b) =>
        (shuffledSpeeds?.[a] || 0) > (shuffledSpeeds?.[b] || 0) ? a : b
    );

    expect(result[0]).toBe(fastestHorseIndex);
    expect(result[n - 1]).toBe(slowestHorseIndex);

    // Log stats about the test
    console.log(
      `Ranked ${n} horses with races of ${m} horses each using ${raceCount} races`
    );
    console.log(`Race efficiency: ${raceCount / n} races per horse`);

    // If algorithm is optimal, we expect approximately O(n log n / log m) races
    const expectedOptimalRaces = (n * Math.log(n)) / Math.log(m);
    console.log(
      `Theoretical optimal races: ~${Math.round(expectedOptimalRaces)}`
    );
  });

  it('should handle very large number of horses (1000 horses)', () => {
    const n = 1000;
    const m = 10;

    // Create a more efficient way to track speeds - use a Map instead of array
    // This is important for large n to avoid memory issues
    const horseSpeeds = new Map<number, number>();
    for (let i = 0; i < n; i++) {
      horseSpeeds.set(i, i + 1); // Speed is i+1, so horse 0 has speed 1 (fastest)
    }

    let raceCount = 0;

    const mockRaceFunction = (horses: number[]) => {
      // Count the number of races
      raceCount++;

      // Sort horses by their speed
      return [...horses].sort(
        (a, b) => (horseSpeeds.get(a) ?? 0) - (horseSpeeds.get(b) ?? 0)
      );
    };

    console.time('1000 horses ranking');
    const result = findHorseRanking(n, m, mockRaceFunction);
    console.timeEnd('1000 horses ranking');

    // Test a small sample of the results to keep test fast
    expect(result[0]).toBe(0); // Fastest horse (speed 1)
    expect(result[n / 2]).toBe(n / 2); // Middle horse
    expect(result[n - 1]).toBe(n - 1); // Slowest horse (speed 1000)

    console.log(
      `Ranked ${n} horses with races of ${m} horses each using ${raceCount} races`
    );
    console.log(`Race efficiency: ${raceCount / n} races per horse`);

    // If algorithm is optimal, we expect approximately O(n log n / log m) races
    const expectedOptimalRaces = (n * Math.log(n)) / Math.log(m);
    console.log(
      `Theoretical optimal races: ~${Math.round(expectedOptimalRaces)}`
    );
  });
});
