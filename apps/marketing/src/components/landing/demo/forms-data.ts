/**
 * Illustrative figures for the forms room.
 *
 * Counts, percentages and the numeric rating ticks are sample data rather than
 * copy, so they live here as literals instead of in the message bundles.
 */

export interface ResponseBar {
  id: string;
  /** Numeric rating tick, shown as-is. */
  tick: string;
  count: string;
  ratio: number;
}

export const responseBars: ResponseBar[] = [
  { id: 'r5', tick: '5', count: '612', ratio: 1 },
  { id: 'r4', tick: '4', count: '381', ratio: 0.62 },
  { id: 'r3', tick: '3', count: '178', ratio: 0.29 },
  { id: 'r2', tick: '2', count: '82', ratio: 0.13 },
  { id: 'r1', tick: '1', count: '31', ratio: 0.05 },
];

export const formsFigures = {
  responses: '1,284',
  average: '4.6',
  completion: '82%',
  completionRatio: 0.82,
} as const;

/** Field slots in the builder pane, in the order they are laid out. */
export const formFieldSlots = [
  { id: 'name', index: '01', required: true },
  { id: 'email', index: '02', required: true },
  { id: 'date', index: '03', required: false },
  { id: 'rating', index: '04', required: false },
  { id: 'feedback', index: '05', required: false },
] as const;

export type FormFieldSlotId = (typeof formFieldSlots)[number]['id'];
