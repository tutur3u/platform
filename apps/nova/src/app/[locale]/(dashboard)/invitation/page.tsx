import { TeamInvitation } from './team-invitation';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';

export default function TeamPage() {
  return (
    <div className="p-4 md:p-8">
      <FeatureSummary
        pluralTitle="Team Invitations"
        singularTitle="Team Invitation"
        description="Manage invitations to join various teams across the platform."
      />
      <div className="mt-6">
        <TeamInvitation />
      </div>
    </div>
  );
}
