import type { ComparisonFeature } from './commercial-comparison-types';
import { FEATURE_TIERS } from './feature-tier-policy';

export * from './commercial-comparison-types';

import { features0 } from './commercial-comparison-0';
import { features1 } from './commercial-comparison-1';
import { features2 } from './commercial-comparison-2';

const gateOrder = ['FREE', 'PLUS', 'PRO', 'ENTERPRISE'];
const advanced: ComparisonFeature[] = [
  {
    id: 'parley_0',
    app: 'parley',
    category: 'internal',
    detail: 'standard',
    values: ['internal', 'internal', 'internal', 'internal'],
  },
  {
    id: 'prioritySupport',
    app: 'platform',
    category: 'operations',
    detail: 'support',
    values: ['excluded', 'excluded', 'included', 'contract'],
  },
  {
    id: 'customIntegrations',
    app: 'platform',
    category: 'operations',
    detail: 'support',
    values: ['excluded', 'excluded', 'preview', 'contract'],
  },
  {
    id: 'dedicatedSupport',
    app: 'platform',
    category: 'operations',
    detail: 'support',
    values: ['excluded', 'excluded', 'excluded', 'contract'],
  },
  {
    id: 'sla',
    app: 'platform',
    category: 'operations',
    detail: 'support',
    values: ['excluded', 'excluded', 'excluded', 'contract'],
  },
  {
    id: 'selfHosting',
    app: 'platform',
    category: 'operations',
    detail: 'support',
    values: ['excluded', 'excluded', 'excluded', 'contract'],
  },
  {
    id: 'aiLab',
    app: 'platform',
    category: 'work',
    detail: 'standard',
    values: ['included', 'included', 'included', 'included'],
    gate: 'ai_lab',
  },
  {
    id: 'voiceAssistant',
    app: 'platform',
    category: 'work',
    detail: 'standard',
    values: ['included', 'included', 'included', 'included'],
    gate: 'voice_assistant',
  },
  {
    id: 'mira',
    app: 'platform',
    category: 'work',
    detail: 'standard',
    values: ['included', 'included', 'included', 'included'],
    gate: 'mira',
  },
  {
    id: 'workforce',
    app: 'platform',
    category: 'work',
    detail: 'standard',
    values: ['included', 'included', 'included', 'included'],
    gate: 'workforce',
  },
];
export const COMPARISON_FEATURES = [
  ...features0,
  ...features1,
  ...features2,
  ...advanced,
].map((row) => {
  if (!row.gate) return row;
  const required = FEATURE_TIERS[row.gate];
  return {
    ...row,
    values: gateOrder.map((tier) =>
      gateOrder.indexOf(tier) >= gateOrder.indexOf(required)
        ? 'included'
        : 'excluded'
    ) as ComparisonFeature['values'],
  };
});
