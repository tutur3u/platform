import type { CapabilityCopy } from '../capabilities/product-scenes';

const ALL_SLIDE_IDS = [
  'opening',
  'origin',
  'problem',
  'moment',
  'shift',
  'vision',
  'ecosystem',
  'platform',
  'tasks',
  'calendar',
  'mail',
  'chat',
  'meet',
  'collaboration',
  'ownership',
  'context',
  'ai',
  'workflow',
  'workforce',
  'capacity',
  'skills',
  'onboarding',
  'simulation',
  'research',
  'architecture',
  'trust',
  'evidence',
  'readiness',
  'pilot',
  'team',
  'engagement',
  'business',
  'audience',
  'pricing',
  'calculator',
  'openness',
  'independence',
  'roadmap',
  'intelligence',
  'horizon',
  'references',
  'closing',
] as const;
export type SlideId = (typeof ALL_SLIDE_IDS)[number];
const CONSOLIDATED_SLIDES: Partial<Record<SlideId, SlideId>> = {
  origin: 'opening',
  shift: 'moment',
  ownership: 'ecosystem',
  ai: 'context',
  onboarding: 'workforce',
  architecture: 'ecosystem',
  readiness: 'roadmap',
  team: 'engagement',
  pricing: 'calculator',
  independence: 'openness',
};
export const SLIDE_IDS = ALL_SLIDE_IDS.filter(
  (id) => !(id in CONSOLIDATED_SLIDES)
);
export interface PitchCopy {
  art: { note: string; horizonAlt: string; closingAlt: string };
  visuals: import('./diagram-primitives').VisualCopy;
  sourceLabel: string;
  references: { label: string; detail: string }[];
  capabilities: CapabilityCopy;
  portfolio: string;
  diagramNote: string;
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
  const requested = hash.replace(/^#/, '') as SlideId;
  const target = CONSOLIDATED_SLIDES[requested] ?? requested;
  const index = SLIDE_IDS.indexOf(target);
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
