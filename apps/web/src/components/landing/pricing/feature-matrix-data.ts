/**
 * Comparison matrix content.
 *
 * `name` values are message-bundle keys under
 * `landing.pricing.matrix.featuresList`, and category keys live under
 * `landing.pricing.matrix.categories`.
 */
export type FeatureValue = boolean | 'limited' | 'advanced' | 'beta' | 'soon';

export interface FeatureRow {
  name: string;
  free: FeatureValue;
  plus: FeatureValue;
  pro: FeatureValue;
  enterprise: FeatureValue;
}

export interface FeatureCategory {
  category: string;
  features: FeatureRow[];
}

export const featureCategories: FeatureCategory[] = [
  {
    category: 'core',
    features: [
      { name: 'tasks', free: true, plus: true, pro: true, enterprise: true },
      {
        name: 'calendar',
        free: 'limited',
        plus: true,
        pro: true,
        enterprise: true,
      },
      {
        name: 'aiChat',
        free: 'limited',
        plus: true,
        pro: 'advanced',
        enterprise: 'advanced',
      },
      {
        name: 'qrGenerator',
        free: true,
        plus: true,
        pro: true,
        enterprise: true,
      },
    ],
  },
  {
    category: 'tools',
    features: [
      {
        name: 'crmInventory',
        free: 'beta',
        plus: 'beta',
        pro: 'beta',
        enterprise: 'beta',
      },
      {
        name: 'tuwrite',
        free: false,
        plus: 'soon',
        pro: 'soon',
        enterprise: 'soon',
      },
      {
        name: 'tuchat',
        free: false,
        plus: 'soon',
        pro: 'soon',
        enterprise: 'soon',
      },
      {
        name: 'tumeet',
        free: false,
        plus: 'soon',
        pro: 'soon',
        enterprise: 'soon',
      },
    ],
  },
  {
    category: 'collaboration',
    features: [
      {
        name: 'whiteboards',
        free: false,
        plus: true,
        pro: true,
        enterprise: true,
      },
      { name: 'drive', free: false, plus: true, pro: true, enterprise: true },
      {
        name: 'timeTracker',
        free: false,
        plus: true,
        pro: true,
        enterprise: true,
      },
      {
        name: 'granularRoles',
        free: false,
        plus: true,
        pro: true,
        enterprise: true,
      },
    ],
  },
  {
    category: 'advanced',
    features: [
      {
        name: 'advancedAI',
        free: false,
        plus: false,
        pro: true,
        enterprise: true,
      },
      {
        name: 'prioritySupport',
        free: false,
        plus: false,
        pro: true,
        enterprise: true,
      },
      {
        name: 'analytics',
        free: false,
        plus: false,
        pro: true,
        enterprise: true,
      },
      {
        name: 'customIntegrations',
        free: false,
        plus: false,
        pro: true,
        enterprise: true,
      },
    ],
  },
  {
    category: 'enterprise',
    features: [
      {
        name: 'customSolutions',
        free: false,
        plus: false,
        pro: false,
        enterprise: true,
      },
      {
        name: 'dedicatedSupport',
        free: false,
        plus: false,
        pro: false,
        enterprise: true,
      },
      { name: 'sla', free: false, plus: false, pro: false, enterprise: true },
      {
        name: 'selfHosting',
        free: false,
        plus: false,
        pro: false,
        enterprise: true,
      },
    ],
  },
];

export type MatrixColumnKey = 'free' | 'plus' | 'pro' | 'enterprise';

export interface MatrixColumn {
  key: MatrixColumnKey;
  /** Message key for the tier name, relative to `landing.pricing`. */
  nameKey: string;
  /** Static accent classes — never interpolate Tailwind names. */
  header: string;
  /** Vertical tint applied to the featured column only. */
  tint: string;
}

export const matrixColumns: MatrixColumn[] = [
  {
    key: 'free',
    nameKey: 'tiers.free.name',
    header: 'text-dynamic-green',
    tint: '',
  },
  {
    key: 'plus',
    nameKey: 'tiers.plus.name',
    header: 'text-dynamic-blue',
    tint: 'bg-dynamic-blue/[0.04]',
  },
  {
    key: 'pro',
    nameKey: 'tiers.pro.name',
    header: 'text-dynamic-purple',
    tint: '',
  },
  {
    key: 'enterprise',
    nameKey: 'tiers.enterprise.name',
    header: 'text-dynamic-orange',
    tint: '',
  },
];
