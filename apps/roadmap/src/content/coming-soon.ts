/** Approved public copy. Change only with an approved replacement. */
import { showPlans } from './tracks.ts';

export const comingSoon = [
  {
    id: 'mira-subscription-plans',
    track: 'mira',
    title: 'Mira subscription plans',
    body: 'Mira subscription plans at $100 and $200/month for access to Mira at the highest limits and capabilities.',
  },
] as const;

/** What the page renders: the approved items while `showPlans` is on. */
export function visibleComingSoon(show: boolean = showPlans) {
  return show ? comingSoon : [];
}
