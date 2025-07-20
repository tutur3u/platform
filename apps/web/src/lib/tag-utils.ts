// Tag color utilities for consistent styling across components

// Dynamic color generation using HSL for better control and consistency
const COLOR_PALETTE = [
  { hue: 210, saturation: 70, lightness: 60 }, // Blue
  { hue: 120, saturation: 70, lightness: 60 }, // Green
  { hue: 270, saturation: 70, lightness: 60 }, // Purple
  { hue: 30, saturation: 70, lightness: 60 },  // Orange
  { hue: 330, saturation: 70, lightness: 60 }, // Pink
  { hue: 180, saturation: 70, lightness: 60 }, // Cyan
  { hue: 60, saturation: 70, lightness: 60 },  // Yellow
  { hue: 0, saturation: 70, lightness: 60 },   // Red
  { hue: 150, saturation: 70, lightness: 60 }, // Teal
  { hue: 300, saturation: 70, lightness: 60 }, // Magenta
  { hue: 90, saturation: 70, lightness: 60 },  // Lime
  { hue: 240, saturation: 70, lightness: 60 }, // Indigo
] as const;

export const DEFAULT_TAG_COLOR =
  'bg-gray-500/20 text-gray-300 border-gray-500/30';

/**
 * Generate HSL color values for a tag
 * @param tag - The tag string
 * @returns HSL color object
 */
function generateTagHSL(tag: string) {
  if (!tag || typeof tag !== 'string') {
    return { hue: 0, saturation: 0, lightness: 50 }; // Gray
  }

  // Enhanced hash function for better distribution
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    const charCode = tag.charCodeAt(i);
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
  const hueVariation = (hash % 30) - 15; // ±15 degrees
  const saturationVariation = (hash % 20) - 10; // ±10%
  const lightnessVariation = (hash % 16) - 8; // ±8%
  
  return {
    hue: (baseColor.hue + hueVariation + 360) % 360,
    saturation: Math.max(50, Math.min(90, baseColor.saturation + saturationVariation)),
    lightness: Math.max(45, Math.min(75, baseColor.lightness + lightnessVariation)),
  };
}

/**
 * Convert HSL to CSS color string
 * @param hsl - HSL color object
 * @returns CSS color string
 */
function hslToCSS(hsl: { hue: number; saturation: number; lightness: number }): string {
  return `hsl(${hsl.hue}, ${hsl.saturation}%, ${hsl.lightness}%)`;
}

/**
 * Generate a consistent color for a tag based on its text
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
      '--tag-bg-color': 'rgb(107 114 128 / 0.2)',
      '--tag-text-color': 'rgb(209 213 219)',
      '--tag-border-color': 'rgb(107 114 128 / 0.3)',
    };
  }

  const hsl = generateTagHSL(tag);
  
  // Generate darker version for text
  const textHSL = { ...hsl, lightness: Math.max(20, hsl.lightness - 30) };
  const textColor = hslToCSS(textHSL);
  
  // Generate border color (slightly darker than background)
  const borderHSL = { ...hsl, lightness: Math.max(15, hsl.lightness - 15) };
  
  return {
    '--tag-bg-color': `hsl(${hsl.hue} ${hsl.saturation}% ${hsl.lightness}% / 0.2)`,
    '--tag-text-color': textColor,
    '--tag-border-color': `hsl(${borderHSL.hue} ${borderHSL.saturation}% ${borderHSL.lightness}% / 0.3)`,
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
 * @returns Array of tag color classes
 */
export function getAvailableTagColors(): readonly string[] {
  // Use predefined Tailwind classes instead of dynamic arbitrary values
  // to ensure proper JIT compilation
  return [
    'bg-blue-500/20 text-blue-700 border-blue-500/30',
    'bg-green-500/20 text-green-700 border-green-500/30',
    'bg-purple-500/20 text-purple-700 border-purple-500/30',
    'bg-orange-500/20 text-orange-700 border-orange-500/30',
    'bg-pink-500/20 text-pink-700 border-pink-500/30',
    'bg-cyan-500/20 text-cyan-700 border-cyan-500/30',
    'bg-yellow-500/20 text-yellow-700 border-yellow-500/30',
    'bg-red-500/20 text-red-700 border-red-500/30',
    'bg-teal-500/20 text-teal-700 border-teal-500/30',
    'bg-fuchsia-500/20 text-fuchsia-700 border-fuchsia-500/30',
    'bg-lime-500/20 text-lime-700 border-lime-500/30',
    'bg-indigo-500/20 text-indigo-700 border-indigo-500/30',
  ] as const;
}
