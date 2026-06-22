import type { LucideIcon } from '@tuturuuu/icons/lucide';
import type { ReactNode } from 'react';

export type LegalSectionColor =
  | 'amber'
  | 'blue'
  | 'cyan'
  | 'emerald'
  | 'green'
  | 'indigo'
  | 'orange'
  | 'pink'
  | 'purple'
  | 'red'
  | 'rose'
  | 'slate'
  | 'teal'
  | 'violet';

export interface LegalSection {
  title: string;
  icon: LucideIcon;
  color: LegalSectionColor;
  content: ReactNode;
}

export interface SummaryRow {
  topic: string;
  summary: ReactNode;
}

export interface ThirdPartyProvider {
  name: string;
  purpose: string;
  url: string;
}

export interface ThirdPartyCategory {
  name: string;
  icon?: LucideIcon;
  providers: ThirdPartyProvider[];
}

export interface LegalPageConfig {
  badgeText: string;
  badgeIcon: LucideIcon;
  title: string;
  highlightedWord: string;
  effectiveDate: string;
  summaryTitle: string;
  summaryDescription: string;
  summaryRows: SummaryRow[];
  sections: LegalSection[];
  footerText: string;
  extraContent?: ReactNode;
}
