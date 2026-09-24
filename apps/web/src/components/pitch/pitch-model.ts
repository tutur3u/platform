export const SLIDE_IDS = [
  'opening',
  'origin',
  'problem',
  'shift',
  'vision',
  'platform',
  'context',
  'ai',
  'workflow',
  'workforce',
  'capacity',
  'skills',
  'onboarding',
  'simulation',
  'evidence',
  'trust',
  'architecture',
  'readiness',
  'pilot',
  'team',
  'engagement',
  'business',
  'audience',
  'pricing',
  'calculator',
  'roadmap',
  'intelligence',
  'horizon',
  'closing',
] as const;
export type SlideId = (typeof SLIDE_IDS)[number];
export interface PitchCopy {
  contact: string;
  company: string;
  simulation: {
    title: string;
    people: string;
    hours: string;
    demand: string;
    capacity: string;
    gap: string;
    headroom: string;
    unit: string;
    caveat: string;
    baseline: string;
    baselineDetail: string;
  };
  title: string;
  description: string;
  edition: string;
  proposal: string;
  livePricingProposal: string;
  pricesLoading: string;
  pricesUnavailable: string;
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
  orbitLabels: string[];
  slides: Record<
    SlideId,
    {
      title: string;
      body: string;
      kicker: string;
      note: string;
      chapter: string;
      status: string;
      panels: { label: string; detail: string }[];
    }
  >;
}
export function slideFromHash(hash: string): number {
  const index = SLIDE_IDS.findIndex((id) => `#${id}` === hash);
  return index < 0 ? 0 : index;
}
export function subscriptionEstimate(
  seats: number,
  annual: boolean,
  prices: Record<'plus' | 'pro', { monthly: number; annual: number }>
) {
  const count = Math.min(100, Math.max(1, Math.trunc(seats) || 1));
  return {
    plus: count * prices.plus[annual ? 'annual' : 'monthly'],
    pro: count * prices.pro[annual ? 'annual' : 'monthly'],
  };
}
