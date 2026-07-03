import { z } from 'zod';

const SUPPORTED_COLORS = [
  'GRAY',
  'RED',
  'BLUE',
  'GREEN',
  'YELLOW',
  'ORANGE',
  'PURPLE',
  'PINK',
  'INDIGO',
  'CYAN',
] as const;

export const supportedColorSchema = z.enum(SUPPORTED_COLORS);

export type SupportedColor = z.infer<typeof supportedColorSchema>;
