import { TeamInvitation } from './team-invitation';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { useTranslations } from 'next-intl';

export default function TeamPage() {
  const t = useTranslations('nova.invitation-page');
  return (
    <div className="p-4 md:p-8">
      <FeatureSummary
        pluralTitle={t('invitations')}
        singularTitle={t('invitation')}
        description={t('invitation-description')}
      />
      <div className="mt-6">
        <TeamInvitation />
      </div>
    </div>
  );
}
