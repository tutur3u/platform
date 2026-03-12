import { z } from 'zod';

export const supportedColorSchema = z.enum([
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
]);

export type SupportedColor = z.infer<typeof supportedColorSchema>;
