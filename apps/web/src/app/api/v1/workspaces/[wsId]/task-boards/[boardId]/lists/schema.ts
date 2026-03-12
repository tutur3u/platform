import { SUPPORTED_COLORS } from '@tuturuuu/types/primitives/SupportedColors';
import { z } from 'zod';

export const supportedColorSchema = z.enum(SUPPORTED_COLORS);

export type SupportedColor = z.infer<typeof supportedColorSchema>;
