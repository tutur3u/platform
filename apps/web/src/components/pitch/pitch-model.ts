import { PROPOSED_WORKSPACE_CATALOG } from '@tuturuuu/payment-core/subscription-constants';

export const SLIDE_IDS = [
  'opening',
  'problem',
  'platform',
  'workflow',
  'audience',
  'ai',
  'pricing',
  'calculator',
  'trust',
  'roadmap',
  'business',
  'closing',
] as const;
export type SlideId = (typeof SLIDE_IDS)[number];
export interface PitchCopy {
  title: string;
  description: string;
  edition: string;
  proposal: string;
  previous: string;
  next: string;
  overview: string;
  notes: string;
  play: string;
  pause: string;
  fullscreen: string;
  exitFullscreen: string;
  fullscreenError: string;
  print: string;
  celebrate: string;
  help: string;
  slide: string;
  members: string;
  monthly: string;
  annual: string;
  perMonth: string;
  perYear: string;
  equivalent: string;
  estimate: string;
  explore: string;
  feedback: string;
  free: string;
  plus: string;
  pro: string;
  enterprise: string;
  custom: string;
  seat: string;
  core: string;
  capacity: string;
  advanced: string;
  contract: string;
  credits: string;
  noClaims: string;
  friction: string[];
  planDetails: string[];
  families: string[];
  products: string[];
  stages: string[];
  people: string[];
  principles: string[];
  roadmap: string[];
  metrics: string[];
  creditValues: string[];
  slides: Record<
    SlideId,
    { title: string; body: string; kicker: string; note: string }
  >;
}
export const PROPOSED_PRICES = {
  plus: {
    monthly: PROPOSED_WORKSPACE_CATALOG.prices.plus.monthly / 100,
    annual: PROPOSED_WORKSPACE_CATALOG.prices.plus.annual / 100,
  },
  pro: {
    monthly: PROPOSED_WORKSPACE_CATALOG.prices.pro.monthly / 100,
    annual: PROPOSED_WORKSPACE_CATALOG.prices.pro.annual / 100,
  },
} as const;
export function slideFromHash(hash: string): number {
  const index = SLIDE_IDS.findIndex((id) => `#${id}` === hash);
  return index < 0 ? 0 : index;
}
export function subscriptionEstimate(seats: number, annual: boolean) {
  const count = Math.min(100, Math.max(1, Math.trunc(seats) || 1));
  return {
    plus: count * PROPOSED_PRICES.plus[annual ? 'annual' : 'monthly'],
    pro: count * PROPOSED_PRICES.pro[annual ? 'annual' : 'monthly'],
  };
}
