// Simple fuzzy search scoring without external dependencies
// Scores items based on how well they match a search query

export interface SearchableItem {
  title: string;
  aliases?: string[];
  [key: string]: any;
}

export interface ScoredResult<T> {
  item: T;
  score: number;
  matchedText: string;
}

/**
 * Calculate a score for how well a text matches a query
 * Higher score = better match
 *
 * Scoring:
 * - Exact match: 1000
 * - Starts with query: 800
 * - Word starts with query: 600
 * - Contains query: 400
 * - Fuzzy match: 100-300 (based on how many chars match)
 * - No match: 0
 */
function scoreMatch(text: string, query: string): number {
  const textLower = text.toLowerCase();
  const queryLower = query.toLowerCase();

  // Exact match
  if (textLower === queryLower) {
    return 1000;
  }

  // Starts with query
  if (textLower.startsWith(queryLower)) {
    return 800;
  }

  // Contains query
  if (textLower.includes(queryLower)) {
    // Bonus if it starts a word
    const words = textLower.split(/\s+/);
    const startsWord = words.some((word) => word.startsWith(queryLower));
    return startsWord ? 600 : 400;
  }

  // Fuzzy match - check if all query characters appear in order
  let queryIndex = 0;
  let matchCount = 0;
  let consecutiveMatches = 0;
  let maxConsecutiveMatches = 0;

  for (let i = 0; i < textLower.length && queryIndex < queryLower.length; i++) {
    if (textLower[i] === queryLower[queryIndex]) {
      matchCount++;
      queryIndex++;
      consecutiveMatches++;
      maxConsecutiveMatches = Math.max(
        maxConsecutiveMatches,
        consecutiveMatches
      );
    } else {
      consecutiveMatches = 0;
    }
  }

  // All characters found in order
  if (queryIndex === queryLower.length) {
    // Score based on match density and consecutive matches
    const matchRatio = matchCount / textLower.length;
    const consecutiveBonus = maxConsecutiveMatches * 10;
    return Math.floor(100 + matchRatio * 200 + consecutiveBonus);
  }

  return 0;
}

/**
 * Search through items and return scored results
 */
export function searchItems<T extends SearchableItem>(
  items: T[],
  query: string,
  options: {
    limit?: number;
    minScore?: number;
    /** Optional function to boost scores based on recency or other factors */
    getBoost?: (item: T) => number;
  } = {}
): ScoredResult<T>[] {
  const { limit = 10, minScore = 100, getBoost } = options;

  if (!query.trim()) {
    // Return all items with neutral score if no query
    // Apply boost even without query to prioritize recent items
    return items
      .map((item) => ({
        item,
        score: getBoost ? getBoost(item) : 0,
        matchedText: item.title,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  const results: ScoredResult<T>[] = [];

  for (const item of items) {
    // Score against title
    let bestScore = scoreMatch(item.title, query);
    let matchedText = item.title;

    // Score against aliases if available
    if (item.aliases && Array.isArray(item.aliases)) {
      for (const alias of item.aliases) {
        const aliasScore = scoreMatch(alias, query);
        if (aliasScore > bestScore) {
          bestScore = aliasScore;
          matchedText = alias;
        }
      }
    }

    // Apply boost if provided (e.g., recency boost)
    if (getBoost) {
      bestScore += getBoost(item);
    }

    // Only include if above minimum score
    if (bestScore >= minScore) {
      results.push({
        item,
        score: bestScore,
        matchedText,
      });
    }
  }

  // Sort by score (highest first)
  results.sort((a, b) => b.score - a.score);

  return results.slice(0, limit);
}

/**
 * Highlight matching characters in text
 * Returns HTML string with <mark> tags around matches
 */
export function highlightMatches(text: string, query: string): string {
  if (!query.trim()) return text;

  const textLower = text.toLowerCase();
  const queryLower = query.toLowerCase();

  // Try exact/contains match first
  const index = textLower.indexOf(queryLower);
  if (index !== -1) {
    const before = text.slice(0, index);
    const match = text.slice(index, index + query.length);
    const after = text.slice(index + query.length);
    return `${before}<mark class="bg-yellow-200 dark:bg-yellow-900/50 text-foreground">${match}</mark>${after}`;
  }

  // Fuzzy match - highlight individual characters
  let result = '';
  let queryIndex = 0;

  for (let i = 0; i < text.length && queryIndex < query.length; i++) {
    if (textLower[i] === queryLower[queryIndex]) {
      result += `<mark class="bg-yellow-200 dark:bg-yellow-900/50 text-foreground">${text[i]}</mark>`;
      queryIndex++;
    } else {
      result += text[i];
    }
  }

  // Append remaining text
  if (result.length < text.length) {
    result += text.slice(result.length);
  }

  return result;
}
