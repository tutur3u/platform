export const COLOR_HIGHLIGHTS = {
  red:    'shadow-[0_0_0_3px_rgba(239,68,68,0.18)] shadow-[inset_0_0_0_2px_rgba(239,68,68,0.35)]',
  orange: 'shadow-[0_0_0_3px_rgba(251,146,60,0.18)] shadow-[inset_0_0_0_2px_rgba(251,146,60,0.35)]',
  yellow: 'shadow-[0_0_0_3px_rgba(250,204,21,0.18)] shadow-[inset_0_0_0_2px_rgba(250,204,21,0.35)]',
  green:  'shadow-[0_0_0_3px_rgba(34,197,94,0.18)] shadow-[inset_0_0_0_2px_rgba(34,197,94,0.35)]',
  blue:   'shadow-[0_0_0_3px_rgba(59,130,246,0.18)] shadow-[inset_0_0_0_2px_rgba(59,130,246,0.35)]',
  purple: 'shadow-[0_0_0_3px_rgba(139,92,246,0.18)] shadow-[inset_0_0_0_2px_rgba(139,92,246,0.35)]',
  pink:   'shadow-[0_0_0_3px_rgba(236,72,153,0.18)] shadow-[inset_0_0_0_2px_rgba(236,72,153,0.35)]',
  indigo: 'shadow-[0_0_0_3px_rgba(99,102,241,0.18)] shadow-[inset_0_0_0_2px_rgba(99,102,241,0.35)]',
  cyan:   'shadow-[0_0_0_3px_rgba(6,182,212,0.18)] shadow-[inset_0_0_0_2px_rgba(6,182,212,0.35)]',
  teal:   'shadow-[0_0_0_3px_rgba(20,184,166,0.18)] shadow-[inset_0_0_0_2px_rgba(20,184,166,0.35)]',
  gray:   'shadow-[0_0_0_3px_rgba(107,114,128,0.18)] shadow-[inset_0_0_0_2px_rgba(107,114,128,0.35)]',
  primary: 'shadow-[0_0_0_3px_rgba(59,130,246,0.18)] shadow-[inset_0_0_0_2px_rgba(59,130,246,0.35)]',
} as const;

// Helper function to generate shadow styles for hex colors
const generateHexShadow = (hexColor: string): string => {
  // Convert hex to RGB
  const hex = hexColor.replace('#', '');
  if (!/^[0-9A-Fa-f]{6}$/.test(hex)) {
    return COLOR_HIGHLIGHTS.primary;
  }
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  
  return `shadow-[0_0_0_3px_rgba(${r},${g},${b},0.18)] shadow-[inset_0_0_0_2px_rgba(${r},${g},${b},0.35)]`;
};

// Function to get the appropriate highlight style for any color
export const getColorHighlight = (color: string): string => {
  // Check if it's a predefined color
  if (color in COLOR_HIGHLIGHTS) {
    return COLOR_HIGHLIGHTS[color as keyof typeof COLOR_HIGHLIGHTS];
  }
  
  // Check if it's a hex color
  if (color.startsWith('#') && (color.length === 7 || color.length === 4)) {
    // Handle 3-digit hex by expanding to 6-digit
    if (color.length === 4) {
      const hex = color.substring(1);
      color = `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`;
    }
    return generateHexShadow(color);
  }
  
  // Fallback to primary
  return COLOR_HIGHLIGHTS.primary;
}; 