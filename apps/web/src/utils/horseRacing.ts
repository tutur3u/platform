/**
 * Horse Racing Ranking Algorithm
 *
 * This algorithm efficiently determines the overall ranking of N horses when we can only
 * race M horses at a time to compare their relative speeds.
 *
 * The approach:
 * 1. If all horses can race at once (N ≤ M), we race them all and get the complete ranking.
 * 2. Otherwise, we divide into groups of size M, race each group, and then use a tournament
 *    style approach to combine results.
 * 3. We maintain a set of candidates for the next fastest horse and progressively build
 *    the complete ranking.
 *
 * Time complexity: O(N log N / log M) races in the optimal case
 * Space complexity: O(N) to store the rankings and candidate sets
 *
 * @param n The total number of horses
 * @param m The number of horses that can be raced at once
 * @param raceFunction A function that takes an array of horses and returns their ranking
 * @returns The complete ranking of all horses from fastest to slowest
 */
export function findHorseRanking(
  n: number,
  m: number,
  raceFunction: (horses: number[]) => number[]
): number[] {
  // Edge cases
  if (n === 0) return [];
  if (m < 2)
    throw new Error(
      'Cannot determine ranking when racing fewer than 2 horses at a time'
    );
  if (n <= m) {
    // If we can race all horses at once, do that
    return raceFunction(Array.from({ length: n }, (_, i) => i));
  }

  // Initialize all horses
  const horses = Array.from({ length: n }, (_, i) => i);
  const finalRanking: number[] = [];

  // Group horses for initial races (optimization: use ceiling division for fewer groups)
  const numGroups = Math.ceil(n / m);
  const groups: number[][] = [];
  for (let i = 0; i < numGroups; i++) {
    groups.push(horses.slice(i * m, Math.min((i + 1) * m, n)));
  }

  // Race each group to get preliminary rankings
  const groupRankings = groups.map((group) => raceFunction([...group]));

  // Optimization: Use a tournament approach to minimize the number of races
  // First, identify the fastest horse overall by racing the winners of each group
  const fastestPerGroup = groupRankings.map((ranking) => ranking?.[0] ?? -1);

  // If we have more winners than can race in one go, we need to do a tournament
  let overallFastestHorse: number;
  if (fastestPerGroup.length <= m) {
    const championshipRace = raceFunction(fastestPerGroup);
    overallFastestHorse = championshipRace[0] ?? -1;
  } else {
    // We have too many group winners, so we need a tournament of winners
    overallFastestHorse = findFastestWithTournament(
      fastestPerGroup,
      m,
      raceFunction
    );
  }

  // Add the fastest horse to the final ranking
  finalRanking.push(overallFastestHorse);

  // Find the group this horse belongs to
  let winningGroupIndex = -1;
  let positionInGroup = -1;
  for (let i = 0; i < groupRankings.length; i++) {
    const pos = groupRankings?.[i]?.indexOf(overallFastestHorse);
    if (pos !== -1) {
      winningGroupIndex = i;
      positionInGroup = pos ?? -1;
      break;
    }
  }

  // Set up candidates for the next position:
  // 1. The second place in the winning group
  // 2. All group winners (except the overall winner)
  const currentCandidates = new Set<number>();

  if (positionInGroup + 1 < (groupRankings?.[winningGroupIndex]?.length ?? 0)) {
    currentCandidates.add(
      groupRankings?.[winningGroupIndex]?.[positionInGroup + 1] ?? -1
    );
  }

  for (let i = 0; i < fastestPerGroup.length; i++) {
    if (fastestPerGroup[i] !== overallFastestHorse) {
      currentCandidates.add(fastestPerGroup[i] ?? -1);
    }
  }

  // Build the rest of the ranking using a tournament approach
  while (currentCandidates.size > 0 && finalRanking.length < n) {
    // Race the current candidates to find the next fastest horse
    const candidatesArray = Array.from(currentCandidates);

    // Handle different cases based on number of candidates
    let nextFastestHorse: number;

    if (candidatesArray.length === 1) {
      // If only one candidate, it's the next fastest
      nextFastestHorse = candidatesArray[0] ?? -1;
    } else if (candidatesArray.length <= m) {
      // If we can race all candidates together
      const raceResult = raceFunction(candidatesArray);
      nextFastestHorse = raceResult[0] ?? -1;
    } else {
      // Too many candidates, use tournament approach
      nextFastestHorse = findFastestWithTournament(
        candidatesArray,
        m,
        raceFunction
      );
    }

    // Add the next fastest horse to the ranking
    finalRanking.push(nextFastestHorse);
    currentCandidates.delete(nextFastestHorse);

    // Find the group this horse belongs to
    for (let i = 0; i < groupRankings.length; i++) {
      const position = groupRankings[i]?.indexOf(nextFastestHorse) ?? -1;
      if (position !== -1 && position + 1 < (groupRankings[i]?.length ?? 0)) {
        // Add the next horse from the same group
        currentCandidates.add(groupRankings?.[i]?.[position + 1] ?? -1);
        break;
      }
    }
  }

  // If we haven't found all horses, add remaining horses from each group
  // This is more efficient than continuing the tournament
  if (finalRanking.length < n) {
    // Create a set of horses we've already ranked
    const rankedHorses = new Set(finalRanking);

    // Go through each group in order
    for (const groupRanking of groupRankings) {
      for (const horse of groupRanking) {
        if (!rankedHorses.has(horse)) {
          finalRanking.push(horse);
          rankedHorses.add(horse);
        }

        if (finalRanking.length === n) break;
      }

      if (finalRanking.length === n) break;
    }
  }

  return finalRanking;
}

/**
 * Helper function to find the fastest horse from a large group using a tournament approach
 *
 * @param horses Array of horse indices to find the fastest from
 * @param m Maximum number of horses that can race at once
 * @param raceFunction Function to race horses
 * @returns The index of the fastest horse
 */
function findFastestWithTournament(
  horses: number[],
  m: number,
  raceFunction: (horses: number[]) => number[]
): number {
  // Base case: if we can race all horses at once
  if (horses.length <= m) {
    const raceResult = raceFunction([...horses]);
    return raceResult?.[0] ?? -1;
  }

  // Divide into groups of size m
  const groups: number[][] = [];
  for (let i = 0; i < horses.length; i += m) {
    groups.push(horses.slice(i, Math.min(i + m, horses.length)));
  }

  // Race each group and collect the winners
  const winners = groups.map((group) => {
    const raceResult = raceFunction(group);
    return raceResult?.[0] ?? -1;
  });

  // Recursively find the fastest among the winners
  return findFastestWithTournament(winners, m, raceFunction);
}
