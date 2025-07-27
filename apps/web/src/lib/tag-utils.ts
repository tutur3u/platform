// Tag color utilities for consistent styling across components

// Dynamic color generation using HSL for better control and consistency
// Optimized for dark mode with excellent contrast ratios
const COLOR_PALETTE = [
  { hue: 210, saturation: 80, lightness: 50 }, // Blue
  { hue: 120, saturation: 80, lightness: 50 }, // Green
  { hue: 270, saturation: 80, lightness: 50 }, // Purple
  { hue: 30, saturation: 80, lightness: 50 }, // Orange
  { hue: 330, saturation: 80, lightness: 50 }, // Pink
  { hue: 180, saturation: 80, lightness: 50 }, // Cyan
  { hue: 60, saturation: 80, lightness: 50 }, // Yellow
  { hue: 0, saturation: 80, lightness: 50 }, // Red
  { hue: 150, saturation: 80, lightness: 50 }, // Teal
  { hue: 300, saturation: 80, lightness: 50 }, // Magenta
  { hue: 90, saturation: 80, lightness: 50 }, // Lime
  { hue: 240, saturation: 80, lightness: 50 }, // Indigo
] as const;

export const DEFAULT_TAG_COLOR =
  'bg-gray-500/20 text-gray-300 border-gray-500/30';

/**
 * Generate HSL color values for a tag
 * @param tag - The tag string
 * @returns HSL color object
 */
function generateTagHSL(tag: string) {
  if (!tag || typeof tag !== 'string' || tag.trim().length === 0) {
    return { hue: 0, saturation: 0, lightness: 50 }; // Gray
  }

  // Sanitize the tag for consistent hashing
  const sanitizedTag = tag.trim().toLowerCase();

  // Enhanced hash function for better distribution
  let hash = 0;
  for (let i = 0; i < sanitizedTag.length; i++) {
    const charCode = sanitizedTag.charCodeAt(i);
    if (charCode !== undefined) {
      hash = (hash << 5) - hash + charCode;
      hash = hash & hash; // Convert to 32-bit integer
    }
  }

  const index = Math.abs(hash) % COLOR_PALETTE.length;
  const baseColor = COLOR_PALETTE[index]; // Safe since index is within bounds

  if (!baseColor) {
    return { hue: 0, saturation: 0, lightness: 50 }; // Fallback to gray
  }

  // Add some variation based on the hash to create more unique colors
  // Reduced variation for more consistent and readable colors
  const hueVariation = (hash % 20) - 10; // ±10 degrees (reduced from ±15)
  const saturationVariation = (hash % 15) - 7; // ±7% (reduced from ±10%)
  const lightnessVariation = (hash % 12) - 6; // ±6% (reduced from ±8%)

  return {
    hue: (baseColor.hue + hueVariation + 360) % 360,
    saturation: Math.max(
      60,
      Math.min(85, baseColor.saturation + saturationVariation)
    ),
    lightness: Math.max(
      50,
      Math.min(70, baseColor.lightness + lightnessVariation)
    ),
  };
}

/**
 * Generate a consistent color for a tag based on its text
 * Optimized for both light and dark modes with excellent contrast
 * @param tag - The tag string
 * @returns CSS variables object for the tag color styling
 */
export function getTagColor(tag: string): {
  '--tag-bg-color': string;
  '--tag-text-color': string;
  '--tag-border-color': string;
} {
  if (!tag || typeof tag !== 'string') {
    return {
      '--tag-bg-color': 'rgb(75 85 99 / 0.2)',
      '--tag-text-color': 'rgb(209 213 219)',
      '--tag-border-color': 'rgb(75 85 99 / 0.4)',
    };
  }

  const hsl = generateTagHSL(tag);

  // Dark mode optimized color generation
  // Background: Dark but visible (15-25% lightness)
  const bgLightness = Math.max(12, Math.min(25, hsl.lightness - 40));
  const bgSaturation = Math.max(40, Math.min(80, hsl.saturation - 10));

  // Text: Bright and highly visible (85-95% lightness)
  const textLightness = Math.max(80, Math.min(95, hsl.lightness + 30));
  const textSaturation = Math.max(60, Math.min(90, hsl.saturation + 15));

  // Border: Medium brightness for definition (30-50% lightness)
  const borderLightness = Math.max(25, Math.min(50, hsl.lightness - 25));
  const borderSaturation = Math.max(50, Math.min(85, hsl.saturation));

  return {
    '--tag-bg-color': `hsl(${hsl.hue} ${bgSaturation}% ${bgLightness}% / 0.9)`,
    '--tag-text-color': `hsl(${hsl.hue} ${textSaturation}% ${textLightness}%)`,
    '--tag-border-color': `hsl(${hsl.hue} ${borderSaturation}% ${borderLightness}% / 0.6)`,
  };
}

/**
 * Get a static Tailwind class for tag styling that works with CSS variables
 * @returns A CSS class string that uses CSS variables for dynamic colors
 */
export function getTagColorClass(): string {
  return 'bg-[var(--tag-bg-color)] text-[var(--tag-text-color)] border-[var(--tag-border-color)]';
}

/**
 * Get tag color styling that combines CSS variables with static Tailwind classes
 * @param tag - The tag string
 * @returns An object with style (CSS variables) and className (static Tailwind classes)
 */
export function getTagColorStyling(tag: string): {
  style: React.CSSProperties;
  className: string;
} {
  const cssVars = getTagColor(tag);
  return {
    style: cssVars as React.CSSProperties,
    className: getTagColorClass(),
  };
}

/**
 * Get a list of available tag colors
 * Optimized for dark mode with better contrast
 * @returns Array of tag color classes
 */
export function getAvailableTagColors(): readonly string[] {
  // Use predefined Tailwind classes optimized for dark mode
  // These provide better contrast ratios in dark themes
  return [
    'bg-blue-600/20 text-blue-300 border-blue-600/40',
    'bg-green-600/20 text-green-300 border-green-600/40',
    'bg-purple-600/20 text-purple-300 border-purple-600/40',
    'bg-orange-600/20 text-orange-300 border-orange-600/40',
    'bg-pink-600/20 text-pink-300 border-pink-600/40',
    'bg-cyan-600/20 text-cyan-300 border-cyan-600/40',
    'bg-yellow-600/20 text-yellow-300 border-yellow-600/40',
    'bg-red-600/20 text-red-300 border-red-600/40',
    'bg-teal-600/20 text-teal-300 border-teal-600/40',
    'bg-fuchsia-600/20 text-fuchsia-300 border-fuchsia-600/40',
    'bg-lime-600/20 text-lime-300 border-lime-600/40',
    'bg-indigo-600/20 text-indigo-300 border-indigo-600/40',
  ] as const;
}
