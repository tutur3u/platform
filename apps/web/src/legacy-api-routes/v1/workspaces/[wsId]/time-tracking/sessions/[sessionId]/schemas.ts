import type { TimeTrackingSession } from '@tuturuuu/types/db';
import { z } from 'zod';

export interface ChainSummary {
  sessions: Array<{
    id: string;
    title: string | null;
    description: string | null;
    start_time: string;
    end_time: string | null;
    duration_seconds: number;
    category_id: string | null;
    task_id: string | null;
    chain_position: number;
  }>;
  breaks: Array<{
    id: string;
    session_id: string;
    break_type_name: string;
    break_start: string;
    break_end: string | null;
    break_duration_seconds: number;
  }>;
  total_sessions: number;
  total_duration_seconds: number;
  first_start_time: string;
  last_end_time: string | null;
}

export const pauseActionSchema = z.object({
  action: z.literal('pause'),
  breakTypeId: z.string().nullable().optional(),
  breakTypeName: z.string().nullable().optional(),
  pendingApproval: z.boolean().optional(),
});

export const editActionSchema = z.object({
  action: z.literal('edit'),
  title: z.string().optional(),
  description: z.string().nullable().optional(),
  categoryId: z.string().nullable().optional(),
  taskId: z.string().nullable().optional(),
  startTime: z.iso.datetime().optional(),
  endTime: z.iso.datetime().optional(),
});

export const patchSessionBodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('stop') }),
  pauseActionSchema,
  z.object({ action: z.literal('resume') }),
  editActionSchema,
]);

export type PatchSessionBody = z.infer<typeof patchSessionBodySchema>;
export type PauseActionBody = z.infer<typeof pauseActionSchema>;
export type EditActionBody = z.infer<typeof editActionSchema>;

export type SessionRecord = TimeTrackingSession & {
  is_running: boolean;
};
