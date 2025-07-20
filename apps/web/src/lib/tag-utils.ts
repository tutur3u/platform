// Tag color utilities for consistent styling across components

export const TAG_COLORS = [
  'bg-blue-500/20 text-blue-300 border-blue-500/30',
  'bg-green-500/20 text-green-300 border-green-500/30',
  'bg-purple-500/20 text-purple-300 border-purple-500/30',
  'bg-orange-500/20 text-orange-300 border-orange-500/30',
  'bg-pink-500/20 text-pink-300 border-pink-500/30',
  'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  'bg-red-500/20 text-red-300 border-red-500/30',
] as const;

export const DEFAULT_TAG_COLOR =
  'bg-gray-500/20 text-gray-300 border-gray-500/30';

/**
 * Generate a consistent color for a tag based on its text
 * @param tag - The tag string
 * @returns A CSS class string for the tag color
 */
export function getTagColor(tag: string): string {
  if (!tag || typeof tag !== 'string') {
    return DEFAULT_TAG_COLOR;
  }

  // Simple hash function to get consistent color for same tag
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    const charCode = tag.charCodeAt(i);
    if (charCode !== undefined) {
      hash = (hash << 5) - hash + charCode;
      hash = hash & hash; // Convert to 32-bit integer
    }
  }

  const index = Math.abs(hash) % TAG_COLORS.length;
  return TAG_COLORS[index] || DEFAULT_TAG_COLOR;
}

/**
 * Get a list of available tag colors
 * @returns Array of tag color classes
 */
export function getAvailableTagColors(): readonly string[] {
  return TAG_COLORS;
}
