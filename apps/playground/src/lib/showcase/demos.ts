import type { InteractiveSlug } from './catalog';

/** What each working demo lets people do, as short imperative steps. */
export const DEMO_STEPS: Record<InteractiveSlug, readonly string[]> = {
  tasks: ['Add a task', 'Tick it off', 'Move it across the board'],
  calendar: [
    'Add an event',
    'Pick a new day or time',
    'Spot overlapping slots',
  ],
  track: [
    'Start the timer',
    'Pause and save an entry',
    'Watch the daily total',
  ],
  finance: [
    'Add income or an expense',
    'Remove a transaction',
    'See totals update',
  ],
  mail: ['Read a message', 'Archive it', 'Compose and send a reply'],
  mind: ['Create a note', 'Edit the title and text', 'Switch between notes'],
};
