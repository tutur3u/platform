import type { LucideIcon } from '@tuturuuu/icons/lucide';
import {
  Bell,
  Clock,
  Code,
  CreditCard,
  Database,
  FileText,
  Globe,
  Lock,
  Scale,
  Server,
  Shield,
  Users,
} from '@tuturuuu/icons/lucide';
import type { LegalDocument, LegalSection } from '@tuturuuu/legal';
import type { LegalPageConfig } from './legal-types';

const icons: Record<LegalSection['icon'], LucideIcon> = {
  bell: Bell,
  clock: Clock,
  code: Code,
  'credit-card': CreditCard,
  database: Database,
  file: FileText,
  globe: Globe,
  lock: Lock,
  scale: Scale,
  server: Server,
  shield: Shield,
  users: Users,
};

export function toLegalPageConfig(document: LegalDocument): LegalPageConfig {
  return {
    badgeIcon: icons[document.sections[0]?.icon ?? 'file'],
    badgeText: document.badge,
    effectiveDate: document.effectiveDate,
    footerText: document.footer,
    highlightedWord: document.highlightedWord,
    sections: document.sections.map((section) => ({
      color: section.tone,
      content: section.content,
      icon: icons[section.icon],
      title: section.title,
    })),
    summaryDescription: document.summaryDescription,
    summaryRows: document.summaryRows,
    summaryTitle: document.summaryTitle,
    title: document.title,
  };
}
