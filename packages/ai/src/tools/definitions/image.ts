import { z } from 'zod';
import { tool } from '../core';

export const imageToolDefinitions = {
  create_image: tool({
    description: 'Generate an image from a text description.',
    inputSchema: z.object({
      prompt: z.string().describe('Detailed image description'),
      aspectRatio: z
        .enum(['1:1', '3:4', '4:3', '9:16', '16:9'])
        .optional()
        .describe('Aspect ratio (default 1:1)'),
      model: z
        .enum([
          'google/imagen-4.0-fast-generate-001',
          'google/imagen-4.0-generate-001',
          'google/gemini-2.5-flash-image',
        ])
        .optional()
        .describe('Image model (auto-selected by plan if omitted)'),
    }),
  }),
  create_qr_code: tool({
    description:
      'Generate a QR code image from any text payload and save it to workspace Drive storage.',
    inputSchema: z.object({
      value: z
        .string()
        .trim()
        .min(1)
        .max(4096)
        .describe('Text content to encode into the QR code'),
      foregroundColor: z
        .string()
        .trim()
        .regex(/^#(?:[0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/)
        .optional()
        .describe('QR foreground color in hex, e.g. #000000'),
      backgroundColor: z
        .string()
        .trim()
        .regex(/^#(?:[0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/)
        .optional()
        .describe('QR background color in hex, e.g. #FFFFFF'),
      size: z
        .number()
        .int()
        .min(128)
        .max(2048)
        .optional()
        .describe('Image width/height in pixels (default 512)'),
      fileName: z
        .string()
        .trim()
        .min(1)
        .max(120)
        .optional()
        .describe('Optional desired filename for download and storage'),
    }),
  }),
} as const;
