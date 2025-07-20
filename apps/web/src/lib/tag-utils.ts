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
 * @returns A CSS class string for the tag color
 */
export function getTagColor(tag: string): string {
  if (!tag || typeof tag !== 'string') {
    return DEFAULT_TAG_COLOR;
  }

  const hsl = generateTagHSL(tag);
  const color = hslToCSS(hsl);
  
  // Generate darker version for text
  const textHSL = { ...hsl, lightness: Math.max(20, hsl.lightness - 30) };
  const textColor = hslToCSS(textHSL);
  
  // Generate border color (slightly darker than background)
  const borderHSL = { ...hsl, lightness: Math.max(15, hsl.lightness - 15) };
  const borderColor = hslToCSS(borderHSL);
  
  return `bg-[${color}]/20 text-[${textColor}] border-[${borderColor}]/30`;
}

/**
 * Get a list of available tag colors
 * @returns Array of tag color classes
 */
export function getAvailableTagColors(): readonly string[] {
  return COLOR_PALETTE.map((_, index) => {
    const hsl = generateTagHSL(`tag-${index}`);
    const bgColor = hslToCSS(hsl);
    const textColor = hslToCSS({ ...hsl, lightness: Math.max(20, hsl.lightness - 30) });
    const borderColor = hslToCSS({ ...hsl, lightness: Math.max(15, hsl.lightness - 15) });
    
    return `bg-[${bgColor}]/20 text-[${textColor}] border-[${borderColor}]/30`;
  });
}
