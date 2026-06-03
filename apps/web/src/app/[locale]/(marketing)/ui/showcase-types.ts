export type CategoryFilter =
  | 'all'
  | 'actions'
  | 'inputs'
  | 'overlays'
  | 'navigation'
  | 'feedback'
  | 'data'
  | 'layout'
  | 'typography'
  | 'advanced';

export type Density = 'compact' | 'comfortable' | 'spacious';
export type Radius = 'square' | 'rounded' | 'soft';
export type Surface = 'plain' | 'muted' | 'elevated';

export interface ShowcaseSettings {
  density: Density;
  radius: Radius;
  surface: Surface;
  showCode: boolean;
  showCustomizations: boolean;
}
