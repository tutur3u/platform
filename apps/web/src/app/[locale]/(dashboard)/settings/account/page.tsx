import {
  ContactInformationCard,
  CurrentPlanCard,
  NotificationsCard,
  PageHeader,
  PaymentBillingCard,
  ProfileInformationCard,
  SecuritySettingsCard,
  WorkspaceSettingsCard,
} from './components';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';

export default async function AccountSettingsPage() {
  const user = await getCurrentUser();

  return (
    <div className="container mx-auto space-y-8 p-6">
      <PageHeader />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <ProfileInformationCard user={user} />
          <ContactInformationCard user={user} />
          <PaymentBillingCard />
          <NotificationsCard />
        </div>

        <div className="space-y-6">
          <CurrentPlanCard />
          <WorkspaceSettingsCard user={user} />
        </div>
      </div>
      <SecuritySettingsCard user={user} />
    </div>
  );
}
