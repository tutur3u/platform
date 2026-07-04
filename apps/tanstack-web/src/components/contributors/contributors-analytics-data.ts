import type { GitHubContributor } from './types';

export const months = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

const monthlyWeights = [7, 8, 11, 9, 12, 10, 13, 8, 9, 11, 12, 14] as const;
const weeklyWeights = [8, 9, 7, 10, 11, 9, 12, 13, 11, 14, 15, 16] as const;

export function totalContributions(contributors: GitHubContributor[]) {
  return contributors.reduce(
    (sum, contributor) => sum + contributor.contributions,
    0
  );
}

function distribute(total: number, weights: readonly number[]) {
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
  let allocated = 0;

  return weights.map((weight, index) => {
    if (index === weights.length - 1) {
      return Math.max(total - allocated, 0);
    }

    const value = Math.floor((total * weight) / weightTotal);
    allocated += value;
    return value;
  });
}

export function getTrendPoints(values: number[]) {
  const max = Math.max(...values, 1);
  return values
    .map((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * 100;
      const y = 95 - (value / max) * 80;
      return `${x},${y}`;
    })
    .join(' ');
}

export function getMonthlyContributionValues(
  contributors: GitHubContributor[]
) {
  return distribute(totalContributions(contributors), monthlyWeights);
}

export function getWeeklyContributionValues(contributors: GitHubContributor[]) {
  return distribute(
    Math.max(Math.floor(totalContributions(contributors) / 4), 1),
    weeklyWeights
  );
}
