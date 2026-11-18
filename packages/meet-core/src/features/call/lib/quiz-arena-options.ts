import type { AssistanceSubject } from '@tuturuuu/education-core/education/inline-assistant';
import { z } from 'zod';

const ASSISTANCE_SUBJECTS = [
  'math',
  'physics',
  'chemistry',
  'biology',
  'writing',
  'general',
] as const satisfies readonly AssistanceSubject[];

/** Inline-assistant subjects plus the wider school curriculum. */
export const ARENA_SUBJECTS = [
  ...ASSISTANCE_SUBJECTS,
  'history',
  'geography',
  'english',
  'computer_science',
] as const;
export type ArenaSubject = (typeof ARENA_SUBJECTS)[number];

export const ARENA_GRADES = [
  'K',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  '11',
  '12',
  'university',
] as const;
export type ArenaGrade = (typeof ARENA_GRADES)[number];

export const miraBoardRequestSchema = z.strictObject({
  subject: z.enum(ARENA_SUBJECTS),
  grade: z.enum(ARENA_GRADES),
  topic: z.string().trim().max(200).optional(),
  categoriesCount: z.number().int().min(3).max(5),
  tiersCount: z.number().int().min(3).max(5),
  locale: z.enum(['en', 'vi']).default('en'),
  includeFinalRound: z.boolean().default(true),
  bonusTiles: z.boolean().default(true),
});
export type MiraBoardRequest = z.output<typeof miraBoardRequestSchema>;
