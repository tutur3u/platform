import { Heart } from '@tuturuuu/icons';
import { LegalPageLayout } from '@/components/legal/legal-page-layout';
import type { LegalPageConfig } from '@/components/legal/legal-types';
import { communityGuidelinesSections } from '@/data/legal/community-guidelines-sections';
import { communityGuidelinesSummaryRows } from '@/data/legal/community-guidelines-summary';

const config: LegalPageConfig = {
  badgeText: 'Community',
  badgeIcon: Heart,
  title: 'Community',
  highlightedWord: 'Guidelines',
  effectiveDate: '2026-02-06',
  summaryTitle: 'Guidelines at a Glance',
  summaryDescription:
    'This summary highlights the key principles but does not replace the full Community Guidelines below.',
  summaryRows: communityGuidelinesSummaryRows,
  sections: communityGuidelinesSections,
  footerText:
    'These Community Guidelines help ensure a positive experience for everyone on Tuturuuu. If you have questions, please contact our community team at community@tuturuuu.com.',
};

export default function CommunityGuidelinesPage() {
  return <LegalPageLayout config={config} />;
}
