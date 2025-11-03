// Import maps from JSON
import type { MapDataJson } from '../types';
import mapsJson from './maps.json';

// Export maps directly from JSON
export const MAPS_DATA = mapsJson as unknown as Record<string, MapDataJson>;
