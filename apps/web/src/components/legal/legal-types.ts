import type { LucideIcon } from '@tuturuuu/icons';
import type { ReactNode } from 'react';

export interface LegalSection {
  title: string;
  icon: LucideIcon;
  color: string; // dynamic color token e.g. 'purple', 'blue', 'green'
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
  icon: LucideIcon;
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
