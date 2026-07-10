// Canvas and layout constants
export const CHART_CONFIG = {
  // Node dimensions
  NODE_WIDTH: 160,
  NODE_HEIGHT: 80,

  // Spacing
  NODE_V_MARGIN: 50,
  NODE_H_MARGIN: 40,

  // Department styling
  DEPARTMENT_PADDING: 40,
  DEPARTMENT_HEADER: 40,
  DEPARTMENT_H_MARGIN: 80,
  DEPARTMENT_SPACING: 120,

  // Canvas settings
  MIN_SCALE: 0.1,
  MAX_SCALE: 3,
  ZOOM_FACTOR: 0.1,

  // Visual styling
  BORDER_RADIUS: 8,
  SHADOW_BLUR: 10,
  SHADOW_OFFSET_Y: 4,

  // Animation and interaction settings
  ANIMATION: {
    HOVER_SCALE: 1.05,
    TRANSITION_DURATION: 200, // ms
    SELECTION_PULSE_DURATION: 1000, // ms
  },

  // Fallback colors (will be replaced by theme colors)
  FALLBACK_COLORS: {
    BACKGROUND: '#ffffff',
    BORDER_DEFAULT: '#e2e8f0',
    BORDER_SELECTED: '#38bdf8',
    SHADOW: 'rgba(0,0,0,0.08)',
    TEXT_PRIMARY: '#1e293b',
    TEXT_SECONDARY: '#64748b',
    REPORTING_LINE: '#cbd5e1',
    COLLABORATION_LINE: '#8b5cf6',
    DEPARTMENT_BORDER: '#cccccc',
    DEPARTMENT_BG_FALLBACK: 'rgba(0,0,0,0.05)',
  },
} as const;

// Executive organizations that should be positioned at the top
export const EXECUTIVE_ORG_IDS = ['org1'] as const;

// External organizations that should be positioned at the bottom
export const EXTERNAL_ORG_IDS = ['org5'] as const;
